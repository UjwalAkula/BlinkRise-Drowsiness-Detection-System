import cv2
import mediapipe as mp
import scipy.spatial
import threading
import time
import pickle
import pandas as pd
import os


class GlobalCameraManager:
    _instance = None
    _camera = None
    _is_streaming = False
    _lock = threading.Lock()
    _camera_release_event = threading.Event()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(GlobalCameraManager, cls).__new__(cls)
            cls._instance._camera_release_event.set()
        return cls._instance

    def start_stream(self):
        with self._lock:
            if not self._is_streaming:
                print("[CameraManager] Attempting to acquire camera...")

                if not self._camera_release_event.wait(timeout=5):
                    print("[CameraManager] Warning: Previous camera release did not complete in time (5s). Proceeding anyway.")
                self._camera_release_event.clear()

                self._camera = cv2.VideoCapture(0) # Try default webcam (ID 0)
                if not self._camera.isOpened():
                    print("[CameraManager] Error: Could not open camera with ID 0. Trying other IDs...")
                    camera_found = False
                    for i in range(1, 5): # Try IDs 1 through 4
                        self._camera = cv2.VideoCapture(i)
                        if self._camera.isOpened():
                            print(f"[CameraManager] Successfully opened camera with ID {i}.")
                            camera_found = True
                            break
                        self._camera = None # Reset if this ID also fails

                    if not camera_found:
                        print("[CameraManager] FATAL: No active camera found or could be opened after trying multiple IDs (0-4).")
                        return False

                time.sleep(0.1)
                success, frame = self._camera.read()
                if not success:
                    print("[CameraManager] CRITICAL ERROR: Camera reported open but failed to read initial frame. Releasing and failing start.")
                    self._camera.release() # Release the potentially faulty camera
                    self._camera = None
                    self._camera_release_event.set() # Indicate release is done
                    return False # Failed to truly start

                print("[CameraManager] Initial frame read successful. Camera is truly ready.")
                self._is_streaming = True
                print("[CameraManager] Camera STARTED. _is_streaming=True")
                return True
            print("[CameraManager] Camera is already active. No action needed.")
            return True # Already streaming, consider it a success

    def stop_stream(self):
        with self._lock:
            if self._is_streaming and self._camera:
                print("[CameraManager] Attempting to stop camera...")
                self._is_streaming = False # Set flag to False first to signal loop termination

                if self._camera.isOpened():
                    self._camera.release() # Release the camera resource
                    print("[CameraManager] cv2.VideoCapture.release() called.")
                else:
                    print("[CameraManager] Camera was not open, skipping release().")

                self._camera = None # Clear the reference to the camera object
                print("[CameraManager] Camera reference set to None.")

                # CRITICAL FIX: Add a small delay to allow the OS to truly release the camera resource
                time.sleep(0.5)
                self._camera_release_event.set() # Signal that camera is fully released
                print("[CameraManager] Camera STOPPED. _is_streaming=False. Release event set.")
                return True
            print("[CameraManager] Camera is not active or already released. No action needed.")
            return False

    def get_frame(self):
        with self._lock:
            if self._camera and self._is_streaming:
                try:
                    success, frame = self._camera.read()
                    if success:
                        return frame
                    else:
                        print("[CameraManager] Failed to read frame from camera (success=False). Initiating stop_stream.")
                        self.stop_stream()
                except cv2.error as e:
                    print(f"[CameraManager] OpenCV error during frame read: {e}. Initiating stop_stream.")
                    self.stop_stream()
                except Exception as e:
                    print(f"[CameraManager] Unexpected error during frame read: {e}. Initiating stop_stream.")
                    self.stop_stream()
            return None

    def is_streaming(self):
        with self._lock:
            return self._is_streaming and (self._camera is not None and self._camera.isOpened())

# Instantiate the global camera manager
camera_manager = GlobalCameraManager()

# Initialize MediaPipe Face Mesh globally
mp_face_mesh = mp.solutions.face_mesh
face_mesh_instance = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# Load the trained SVM model
model = None
MODEL_FILE = 'svm_model.pkl'
if not os.path.exists(MODEL_FILE):
    print(f"[ERROR] SVM model file '{MODEL_FILE}' not found at {os.path.abspath(MODEL_FILE)}. Drowsiness detection will not use the SVM model.")
else:
    try:
        with open(MODEL_FILE, 'rb') as f:
            model = pickle.load(f)
        print("[INFO] SVM model loaded successfully.")
    except Exception as e:
        model = None
        print(f"[ERROR] Error loading SVM model: {e}. Drowsiness detection will not use the SVM model.")

# Drowsiness detection constants
DROWSY_PROB_THRESHOLD = 0.6
CONSECUTIVE_DROWSY_FRAMES = 10

# Global state variables for drowsiness detection data
drowsiness_state = {
    'counter': 0,
    'alarm_on': False,
    'last_alert_time': 0, # This might still be useful for rate limiting alerts if you reinstitute them
    'ear': 0.0,
    'blink': 0,
    'status': 'No Face',
    'probability': 0.0
}
state_lock = threading.Lock()

def calculate_ear(eye_points):
    A = scipy.spatial.distance.euclidean(eye_points[1], eye_points[5])
    B = scipy.spatial.distance.euclidean(eye_points[2], eye_points[4])
    C = scipy.spatial.distance.euclidean(eye_points[0], eye_points[3])
    ear = (A + B) / (2.0 * C)
    return ear

def get_eye_points(landmarks, img_shape):
    h, w = img_shape[:2]
    left_idx = [33, 160, 158, 133, 153, 144]
    right_idx = [263, 387, 385, 362, 380, 373]
    left_eye = [(int(landmarks[i].x * w), int(landmarks[i].y * h)) for i in left_idx]
    right_eye = [(int(landmarks[i].x * w), int(landmarks[i].y * h)) for i in right_idx]
    return left_eye, right_eye

def process_video_frame(frame):
    with state_lock:
        frame = cv2.flip(frame, 1)
        img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh_instance.process(img_rgb)

        drowsiness_state['alarm_on'] = False

        current_ear = 0.0
        current_blink = 0
        current_status = "No Face"
        current_prob = 0.0

        if results.multi_face_landmarks:
            landmarks = results.multi_face_landmarks[0].landmark
            left_eye, right_eye = get_eye_points(landmarks, frame.shape)

            for (x, y) in left_eye + right_eye:
                cv2.circle(frame, (int(x), int(y)), 1, (0, 255, 0), -1)

            ear_left = calculate_ear(left_eye)
            ear_right = calculate_ear(right_eye)
            current_ear = (ear_left + ear_right) / 2.0

            current_blink = 1 if current_ear < 0.2 else 0

            if model:
                input_data = pd.DataFrame([[current_ear, current_blink]], columns=['EAR', 'Blink'])

                try:
                    current_prob = model.predict_proba(input_data)[0][1]
                    current_status = 'Drowsy' if current_prob > DROWSY_PROB_THRESHOLD else 'Non_Drowsy'

                    if current_status == 'Drowsy':
                        drowsiness_state['counter'] += 1
                        if drowsiness_state['counter'] >= CONSECUTIVE_DROWSY_FRAMES:
                            cv2.putText(frame, "DROWSINESS ALERT!", (10, 120),
                                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 3)
                            drowsiness_state['alarm_on'] = True # Keep this flag, frontend reads it
                    else:
                        if drowsiness_state['counter'] > 0:
                            drowsiness_state['counter'] = 0
                        drowsiness_state['alarm_on'] = False # Keep this flag, frontend reads it

                except Exception as e:
                    print(f"[ERROR] Error during SVM prediction: {e}")
                    current_status = "Prediction Error"
                    drowsiness_state['counter'] = 0
                    drowsiness_state['alarm_on'] = False

            else:
                current_status = "No SVM Model"
                if current_ear < 0.2:
                    current_status = "Eyes Closed (No SVM)"
                else:
                    current_status = "Eyes Open (No SVM)"
                drowsiness_state['counter'] = 0
                drowsiness_state['alarm_on'] = False

        else:
            drowsiness_state['counter'] = 0
            drowsiness_state['alarm_on'] = False
            current_status = "No Face"
            cv2.putText(frame, "No face detected", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)

        drowsiness_state['ear'] = current_ear
        drowsiness_state['blink'] = current_blink
        drowsiness_state['status'] = current_status
        drowsiness_state['probability'] = current_prob

        cv2.putText(frame, f"EAR: {drowsiness_state['ear']:.2f}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        cv2.putText(frame, f"Blink: {drowsiness_state['blink']}", (10, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)
        cv2.putText(frame, f"Status: {drowsiness_state['status']}", (10, 90),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        if model:
            cv2.putText(frame, f"Prob(Drowsy): {drowsiness_state['probability']:.2f}", (10, 150),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)
        else:
            cv2.putText(frame, "SVM NOT LOADED", (10, 150),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

        if drowsiness_state['alarm_on']:
            cv2.putText(frame, "ALERT ACTIVE!", (frame.shape[1] - 200, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        else:
            cv2.putText(frame, "ALERT INACTIVE", (frame.shape[1] - 200, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        return frame
