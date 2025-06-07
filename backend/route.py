import cv2
from flask import Blueprint, Response, jsonify, request
import time
import controller

routes_bp = Blueprint('routes', __name__)

def generate_video_stream():
    print("[ROUTE] `generate_video_stream` initiated.")

    while controller.camera_manager.is_streaming():
        frame = controller.camera_manager.get_frame()
        if frame is None:
            print("[ROUTE] No frame received from camera manager, breaking video stream generator loop.")
            break

        processed_frame = controller.process_video_frame(frame)
        ret, buffer = cv2.imencode('.jpg', processed_frame)
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        
        time.sleep(0.01)

    print("[ROUTE] Video stream generator finished its loop.")

@routes_bp.route('/video_feed')
def video_feed():
    if not controller.camera_manager.is_streaming():
        print("[ROUTE] /video_feed requested, but camera is not streaming. Returning 503 Service Unavailable.")
        return Response("Camera not active or unavailable. Please ensure camera is turned on.", status=503, mimetype='text/plain')

    return Response(generate_video_stream(), mimetype='multipart/x-mixed-replace; boundary=frame')

@routes_bp.route('/drowsiness_status')
def get_drowsiness_status():
    with controller.state_lock:
        data = {
            'ear': controller.drowsiness_state['ear'],
            'blink': controller.drowsiness_state['blink'],
            'status': controller.drowsiness_state['status'],
            'probability': controller.drowsiness_state['probability'],
            'alarm_on': controller.drowsiness_state['alarm_on']
        }
    return jsonify(data)

@routes_bp.route('/camera_control', methods=['POST'])
def camera_control():
    data = request.get_json()
    action = data.get('action')

    if action == 'start':
        print("[ROUTE] Received /camera_control 'start' action.")
        if controller.camera_manager.start_stream():
            return jsonify({"status": "success", "message": "Camera stream started."}), 200
        else:
            return jsonify({"status": "failed", "message": "Failed to start camera or it's already in use."}), 400
    elif action == 'stop':
        print("[ROUTE] Received /camera_control 'stop' action.")
        if controller.camera_manager.stop_stream():
            with controller.state_lock:
                controller.drowsiness_state['counter'] = 0
                controller.drowsiness_state['alarm_on'] = False
                controller.drowsiness_state['ear'] = 0.0
                controller.drowsiness_state['blink'] = 0
                controller.drowsiness_state['status'] = 'Video Off'
                controller.drowsiness_state['probability'] = 0.0
            return jsonify({"status": "success", "message": "Camera stream stopped and state reset."}), 200
        else:
            return jsonify({"status": "failed", "message": "Camera is not streaming or already stopped."}), 400
    else:
        return jsonify({"status": "error", "message": "Invalid action. Use 'start' or 'stop'."}), 400