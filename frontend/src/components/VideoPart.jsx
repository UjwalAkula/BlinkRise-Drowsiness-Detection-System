import React, { useRef, useEffect } from 'react';
import { Box, Paper, Typography, CircularProgress } from '@mui/material';

const VideoPart = ({ videoStreamUrl, backendError, isVideoOn, videoLoading, setVideoLoading, drowsinessData, streamKey }) => {
    const imgRef = useRef(null);
    const loadingTimeoutRef = useRef(null);
    const audioRef = useRef(null); 


    useEffect(() => {
        const currentImg = imgRef.current;


        if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
        }

        if (isVideoOn) {

            setVideoLoading(true);
            console.log("[VideoPart] Video stream attempting to load (setting loading=true).");

            if (currentImg) {
                // Event Handlers for the image element
                const handleLoad = () => {
                    setVideoLoading(false); // Video loaded successfully, hide spinner
                    console.log("[VideoPart] Video stream loaded.");
                    if (loadingTimeoutRef.current) {
                        clearTimeout(loadingTimeoutRef.current); // Clear timeout if load happened naturally
                        loadingTimeoutRef.current = null;
                    }
                };
                const handleError = (e) => {
                    setVideoLoading(false); // Stop loading on error
                    console.error("[VideoPart] Video stream error:", e);
                    if (loadingTimeoutRef.current) {
                        clearTimeout(loadingTimeoutRef.current); // Clear timeout if error happened
                        loadingTimeoutRef.current = null;
                    }
 
                };

                // Add event listeners to the image element
                currentImg.addEventListener('load', handleLoad);
                currentImg.addEventListener('error', handleError);


                loadingTimeoutRef.current = setTimeout(() => {

                    if (videoLoading) {
                        setVideoLoading(false);
                        console.log("[VideoPart] Loading timeout reached, turning off spinner.");
                    }
                    loadingTimeoutRef.current = null; 
                }, 2000);


                return () => {
                    currentImg.removeEventListener('load', handleLoad);
                    currentImg.removeEventListener('error', handleError);
                    if (loadingTimeoutRef.current) {
                        clearTimeout(loadingTimeoutRef.current);
                        loadingTimeoutRef.current = null;
                    }
                };
            }
        } else {

            setVideoLoading(false);
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
                loadingTimeoutRef.current = null;
            }
            console.log("[VideoPart] Video is off, loading set to false.");

        }
    }, [isVideoOn, streamKey, setVideoLoading]);


    useEffect(() => {
        if (audioRef.current) {
            if (drowsinessData.alarm_on) {

                if (audioRef.current.paused) {
                    audioRef.current.play().catch(e => console.error("Error playing alarm sound:", e));
                }
            } else {

                if (!audioRef.current.paused) {
                    audioRef.current.pause();
                    audioRef.current.currentTime = 0; 
                }
            }
        }
    }, [drowsinessData.alarm_on]); 


    const imageUrl = isVideoOn ? `${videoStreamUrl}?key=${streamKey}` : null;

    return (
        <Box sx={{ mb: 4, textAlign: 'center' }}>
            <Paper elevation={3} sx={{ p: 2, borderRadius: '8px', backgroundColor: '#ffffff' }}>
                <Typography variant="h6" sx={{ mb: 2, color: '#333', fontWeight: 'bold' }}>
                    Live Camera Feed
                </Typography>
                {isVideoOn ? ( 
                    <Box sx={{
                        position: 'relative',
                        width: '100%',
                        aspectRatio: '16/9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#eee',
                        overflow: 'hidden',
                        borderRadius: '4px',
                        border: backendError ? '2px solid red' : '1px solid #ddd', 
                    }}>

                        {videoLoading && !backendError && isVideoOn && (
                            <CircularProgress sx={{ position: 'absolute', color: '#1976d2' }} />
                        )}

                        <img
                            key={streamKey} 
                            ref={imgRef} 
                            src={imageUrl || ''}
                            alt="Live Video Feed"
                            style={{
                                maxWidth: '100%',
                                maxHeight: '100%',
                                height: 'auto', 

                            }}
                        />

                        {backendError && isVideoOn && (
                            <Typography variant="caption" color="error" sx={{ position: 'absolute', bottom: 8, left: 8, right: 8, backgroundColor: 'rgba(255,255,255,0.8)', padding: '4px', borderRadius: '4px' }}>
                                Error: {backendError}
                            </Typography>
                        )}
                    </Box>
                ) : ( 
                    <Box sx={{
                        width: '100%',
                        aspectRatio: '16/9',
                        backgroundColor: '#eee',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        color: '#777',
                        border: '1px solid #ddd', 
                    }}>
                        <Typography variant="h6">Video Off</Typography>
                    </Box>
                )}

                <audio ref={audioRef} loop src="/alaram.mp3" preload="auto"></audio>

                <Typography variant="body2" sx={{ mt: 2, color: drowsinessData.alarm_on ? 'red' : 'green', fontWeight: 'bold' }}>
                    Status: {drowsinessData.status} {drowsinessData.alarm_on && '(ALARM)'}
                </Typography>
            </Paper>
        </Box>
    );
};

export default VideoPart;
