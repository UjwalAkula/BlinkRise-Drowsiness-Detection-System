import React from 'react';
import { Box, Paper, Typography } from '@mui/material';

const MetricBoxes = ({ drowsinessData }) => {
    const metrics = [
        { label: "EAR", value: drowsinessData.ear.toFixed(2), color: '#4CAF50' },
        { label: "Blink Count", value: drowsinessData.blink, color: '#2196F3' },
        { label: "Status", value: drowsinessData.status, color: drowsinessData.alarm_on ? '#f44336' : '#FFC107' },
        { label: "Drowsy Prob.", value: `${(drowsinessData.probability * 100).toFixed(2)}%`, color: '#9C27B0' },
    ];

    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: '1fr' }, gap: 2 }}>
            {metrics.map((metric) => (
                <Paper key={metric.label} elevation={3} sx={{ p: 2, borderRadius: '8px', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="subtitle1" sx={{ color: '#555', fontWeight: 'bold', mb: 1 }}>
                        {metric.label}
                    </Typography>
                    <Typography variant="h5" sx={{ color: metric.color, fontWeight: 'bold' }}>
                        {metric.value}
                    </Typography>
                </Paper>
            ))}
        </Box>
    );
};

export default MetricBoxes;