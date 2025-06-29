# CheckMate - Real-Time Internet Overuse Detection Extension

## Overview
CheckMate is a Chrome extension that uses machine learning to detect unhealthy internet usage patterns in real-time. It employs a Hoeffding Adaptive Tree with user feedback integration and concept drift detection to provide accurate, personalized overuse detection.

## Features

### 🔍 Real-Time Detection
- **Hoeffding Tree ML Algorithm**: Adapts to your usage patterns
- **Statistical Process Control**: Zero-shot anomaly detection
- **Concept Drift Detection**: ADWIN algorithm for pattern changes
- **Ensemble Methods**: Combines multiple detection approaches

### 👤 User-Centric Design
- **User Feedback Integration**: Improve accuracy through corrections
- **Website Categorization**: Customize productive/unproductive/unhealthy sites
- **Privacy Controls**: Pause tracking, delete data, export information
- **Break Timer**: Guided break activities and breathing exercises

### 📊 Comprehensive Analytics
- **Usage Classification**: Productive, unproductive, unhealthy sessions
- **Confidence Scoring**: AI assessment reliability metrics
- **Interactive Dashboard**: Charts, trends, and pattern analysis
- **Model Performance**: Tree depth, drift events, feedback accuracy

### 🛡️ Privacy & Security
- **Local Processing**: All ML computation happens locally
- **Data Control**: Export or delete all data anytime
- **No External Servers**: No data sent to external services
- **Transparent Operations**: Full visibility into AI decisions

## Installation

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension folder
5. The CheckMate icon should appear in your toolbar

### File Structure
```
checkmate-extension/
├── manifest.json
├── README.md
├── src/
│   ├── background/
│   │   └── service-worker.js
│   ├── content/
│   │   └── content-script.js
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   ├── popup.js
│   │   ├── options.html
│   │   ├── options.js
│   │   ├── stats.html
│   │   ├── stats.js
│   │   ├── break-timer.html
│   │   ├── break-timer.css
│   │   ├── break-timer.js
│   │   ├── feedback-manager.js
│   │   └── chart.umd.min.js
│   ├── ml/
│   │   ├── hoeffding-tree.js
│   │   ├── feature-engineer.js
│   │   ├── ensemble.js
│   │   ├── spc.js
│   │   ├── adwin.js
│   │   └── isolation-forest.js
│   └── utils/
│       └── circular-buffer.js
└── assets/
    └── icons/
        ├── icon16.png
        ├── icon32.png
        ├── icon48.png
        └── icon128.png
```

## Usage Guide

### Getting Started
1. **Initial Setup**: Click the CheckMate icon to open the popup
2. **Website Categorization**: Use "Manage Websites" to categorize domains
3. **Feedback Training**: Provide session feedback to improve accuracy
4. **Monitor Usage**: View real-time health indicators and AI assessments

### Website Categories
- **Productive**: Work, learning, beneficial activities (e.g., GitHub, documentation sites)
- **Unproductive**: Entertainment, social media, neutral browsing (e.g., YouTube, Reddit)
- **Unhealthy**: Excessive, addictive, or harmful usage patterns

### Understanding AI Predictions
- **Pattern Score**: How closely current activity matches overuse patterns (0-100%)
- **Confidence**: AI certainty in its assessment (0-100%)
- **Health Indicator**: Real-time usage health (Healthy/Moderate/Concerning)

### Break Timer Features
- **Preset Durations**: 5, 10, 15, or 30-minute breaks
- **Guided Activities**: 
  - 4-7-8 breathing exercises
  - Quick stretches for neck and shoulders
  - 20-20-20 rule for eye rest
  - Light movement suggestions

### Analytics Dashboard
Access comprehensive statistics through "View Detailed Stats":
- Usage classification trends over time
- AI confidence patterns
- Daily activity heatmaps
- Website category distribution
- Model performance metrics

## Configuration

### Settings
- **Enable Monitoring**: Toggle overall detection system
- **Enable Notifications**: Control overuse alert notifications
- **Detection Sensitivity**: Adjust ML model sensitivity (0.1-1.0)

### Privacy Controls
- **Pause Tracking**: Temporarily stop all monitoring
- **Download Data**: Export all analytics data as JSON
- **Delete All Data**: Permanently remove all stored information

## Technical Architecture

### Machine Learning Pipeline
1. **Feature Engineering**: Extract behavioral patterns from browser events
2. **Hoeffding Tree**: Incremental learning classifier for session types
3. **Statistical Process Control**: Anomaly detection for unusual patterns
4. **Ensemble Methods**: Combine multiple detection approaches
5. **Drift Detection**: ADWIN algorithm for concept drift adaptation

### Data Processing
- **Real-time Feature Extraction**: Tab switches, focus time, scroll patterns
- **Circular Buffers**: Efficient sliding window operations
- **Privacy-First Design**: No external data transmission

### Browser Integration
- **Content Scripts**: Monitor page-level interactions
- **Background Service**: ML processing and drift detection
- **Storage APIs**: Local data persistence with encryption

## Troubleshooting

### Common Issues

**Extension Not Loading**
- Ensure all files are present in the extension directory
- Check Chrome Developer Tools for JavaScript errors
- Verify manifest.json is valid

**ML Model Not Working**
- Allow time for initial training (50+ interactions)
- Provide feedback through session classifications
- Check that website categories are properly configured

**Performance Issues**
- Reduce detection sensitivity in settings
- Clear old data if storage becomes large
- Restart Chrome if memory usage is high

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Chrome Extension API for robust browser integration
- Chart.js for beautiful data visualizations
- Machine learning algorithms adapted from academic research
- User experience design inspired by digital wellbeing principles

---

**Version**: 1.0.0  
**Last Updated**: December 2024  
**Compatibility**: Chrome 88+, Manifest V3