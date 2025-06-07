import React, { useState, useEffect, useRef } from 'react';
import { Box, Button, CircularProgress, Typography, Paper } from '@mui/material';
import VideoPart from './components/VideoPart';
import MetricBoxes from './components/MetricBoxes';

const App = () => {
    const [drowsinessData, setDrowsinessData] = useState({
        ear: 0.00,
        blink: 0,
        status: "Loading...",
        probability: 0.00,
        alarm_on: false
    });
    const [backendError, setBackendError] = useState(null);
    const [isVideoOn, setIsVideoOn] = useState(false);
    const [videoLoading, setVideoLoading] = useState(false);
    const [streamKey, setStreamKey] = useState(0);

    const pollingIntervalRef = useRef(null);


    const API_BASE_URL = 'http://192.168.29.83:5000'; 

    const drowsinessStatusUrl = `${API_BASE_URL}/drowsiness_status`;
    const cameraControlUrl = `${API_BASE_URL}/camera_control`;

    const fetchDrowsinessStatus = async () => {
        // Only poll if video is expected to be on and polling is active
        if (!isVideoOn && pollingIntervalRef.current === null) {
            console.log("[FRONTEND] Polling skipped: video is off or interval cleared.");
            return;
        }

        try {
            const response = await fetch(drowsinessStatusUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
            const data = await response.json();
            setDrowsinessData(data);
            setBackendError(null); // Clear any previous backend errors
        } catch (error) {
            console.error("Error fetching drowsiness status:", error);
            setBackendError(`Could not fetch drowsiness status: ${error.message}. Is backend running?`);

            // Stop polling and reset video state if there's a persistent fetch error
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
                console.log("[FRONTEND] Polling interval cleared due to fetch error.");
            }
            setIsVideoOn(false); // Turn off video state in frontend
            setVideoLoading(false); // Stop loading spinner
            setDrowsinessData(prev => ({ ...prev, status: "Disconnected" })); // Update status message
        }
    };

    const sendCameraControl = async (action) => {
        try {
            const response = await fetch(cameraControlUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action: action }),
            });
            const data = await response.json();
            if (!response.ok) {
                console.error(`Backend camera control HTTP error for action '${action}':`, response.status, data.message);
                return { status: "failed", message: data.message || "Unknown error from backend" };
            } else {
                console.log(`Camera control successful for action '${action}':`, data.message);
                return { status: "success", message: data.message };
            }
        } catch (error) {
            console.error(`Network or parsing error sending camera control for action '${action}':`, error);
            return { status: "error", message: error.message };
        }
    };

    const handleToggleVideo = () => {
        if (isVideoOn) {
            console.log("[FRONTEND] User clicked 'Turn Off Video'. Initiating shutdown.");
            setIsVideoOn(false);
            setVideoLoading(false);

            // Clear polling interval immediately when turning video off
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
                console.log("[FRONTEND] Polling interval cleared.");
            }
            // Reset drowsiness data and errors to a clean state
            setDrowsinessData({
                ear: 0.00,
                blink: 0,
                status: "Video Off",
                probability: 0.00,
                alarm_on: false
            });
            setBackendError(null);
            setStreamKey(0); // Reset stream key to force video element re-render

            // Send stop command to backend. Reloading window is a hard reset but effective.
            sendCameraControl('stop').then(response => {
                console.log("[FRONTEND] Backend stop command result:", response);
                window.location.reload(); // Hard reload for a clean restart
            });

        } else {
            console.log("[FRONTEND] User clicked 'Turn On Video'. Sending start command to backend.");
            setIsVideoOn(true);
            setVideoLoading(true);
            setBackendError(null); // Clear previous errors
            setStreamKey(prev => prev + 1); // Increment key to force video element re-render for new stream

            // Send start command to backend
            sendCameraControl('start')
                .then(response => {
                    if (response.status === "success") {
                        console.log("[FRONTEND] Backend confirmed camera started. Starting polling.");
                        // Clear any existing interval before setting a new one
                        if (pollingIntervalRef.current) {
                            clearInterval(pollingIntervalRef.current);
                        }
                        // Start polling for drowsiness status every 500ms
                        pollingIntervalRef.current = setInterval(fetchDrowsinessStatus, 500);
                        fetchDrowsinessStatus(); // Fetch immediately on start
                    } else {
                        // Handle backend failure to start camera
                        console.error("[FRONTEND] Backend failed to start camera:", response.message);
                        setIsVideoOn(false);
                        setVideoLoading(false);
                        setBackendError(`Failed to start camera on backend: ${response.message}`);
                    }
                })
                .catch(error => {
                    // Handle network or promise rejection errors during camera start
                    console.error("[FRONTEND] Network or promise error initiating camera start on backend:", error);
                    setIsVideoOn(false);
                    setVideoLoading(false);
                    setBackendError("Network error: Could not connect to backend to start camera.");
                });
        }
    };


    useEffect(() => {
        return () => {
 
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
                console.log("[FRONTEND] App unmounting: Polling interval cleared.");
            }

            console.log("[FRONTEND] App component unmounting. Sending final stop command to backend.");
            sendCameraControl('stop');
        };
    }, []);

    return (
        <Box sx={{ p: 3, maxWidth: '1200px', margin: 'auto', mt: 4, display: 'flex', flexDirection: 'column', minHeight: '90vh' }}>
  
            <Typography
                variant="h4"
                gutterBottom
                align="center"
                sx={{
                    fontWeight: 'bold',
                    color: '#1976d2',
                    mb: 4,

                    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)', 
                    padding: '10px 20px',
                    borderRadius: '8px', 
                    backgroundColor: 'white',
                }}
            >
                BlinkRise: Drowsiness Detection System
            </Typography>

            {backendError && (
                <Paper elevation={3} sx={{ p: 2, mb: 3, backgroundColor: '#ffebee', border: '1px solid #f44336', borderRadius: '8px' }}>
                    <Typography color="error" align="center">
                        Error: {backendError}
                    </Typography>
                </Paper>
            )}

            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3, flexGrow: 1, mb: 3 }}>
                <Box sx={{ flex: 2 }}>
                    <VideoPart
                        videoStreamUrl={API_BASE_URL + '/video_feed'}
                        backendError={backendError}
                        isVideoOn={isVideoOn}
                        videoLoading={videoLoading}
                        setVideoLoading={setVideoLoading}
                        drowsinessData={drowsinessData}
                        streamKey={streamKey}
                    />
                </Box>
                <Box sx={{ flex: 1 }}>
                    <MetricBoxes
                        drowsinessData={drowsinessData}
                    />
                </Box>
            </Box>

            <Paper elevation={3} sx={{ p: 3, borderRadius: '8px', backgroundColor: 'white', textAlign: 'center' }}>
                <Button
                    variant="contained"
                    color={isVideoOn ? "error" : "primary"}
                    onClick={handleToggleVideo}
                    sx={{
                        fontSize: '1.1rem',
                        padding: '10px 20px',
                        borderRadius: '25px',
                        boxShadow: '0 3px 5px 2px rgba(0, 0, 0, .3)',
                        transition: 'transform 0.2s ease-in-out',
                        '&:hover': {
                            transform: 'scale(1.05)',
                        }
                    }}
                >
                    {isVideoOn ? "Turn Off Video" : "Turn On Video"}
                </Button>
            </Paper>
        </Box>
    );
};

export default App;