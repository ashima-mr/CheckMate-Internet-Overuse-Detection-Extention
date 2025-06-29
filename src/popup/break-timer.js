/**
 * Break Timer JavaScript functionality
 * Provides timer controls and activity guides
 */

class BreakTimer {
    constructor() {
        this.timeRemaining = 300; // 5 minutes default
        this.totalTime = 300;
        this.isRunning = false;
        this.intervalId = null;
        this.selectedActivity = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateDisplay();
    }

    setupEventListeners() {
        // Timer controls
        document.getElementById('startBtn').addEventListener('click', () => this.startTimer());
        document.getElementById('pauseBtn').addEventListener('click', () => this.pauseTimer());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetTimer());

        // Preset time buttons
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const time = parseInt(e.target.dataset.time);
                this.setTime(time);
                
                // Update active button
                document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });

        // Activity cards
        document.querySelectorAll('.activity-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const activity = e.currentTarget.dataset.activity;
                this.showActivityGuide(activity);
            });
        });
    }

    setTime(seconds) {
        if (!this.isRunning) {
            this.timeRemaining = seconds;
            this.totalTime = seconds;
            this.updateDisplay();
        }
    }

    startTimer() {
        this.isRunning = true;
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('pauseBtn').style.display = 'flex';
        
        this.intervalId = setInterval(() => {
            this.timeRemaining--;
            this.updateDisplay();
            
            if (this.timeRemaining <= 0) {
                this.timerComplete();
            }
        }, 1000);
    }

    pauseTimer() {
        this.isRunning = false;
        clearInterval(this.intervalId);
        document.getElementById('startBtn').style.display = 'flex';
        document.getElementById('pauseBtn').style.display = 'none';
        document.getElementById('startBtn').innerHTML = '<span>▶</span> Resume';
    }

    resetTimer() {
        this.isRunning = false;
        clearInterval(this.intervalId);
        this.timeRemaining = this.totalTime;
        document.getElementById('startBtn').style.display = 'flex';
        document.getElementById('pauseBtn').style.display = 'none';
        document.getElementById('startBtn').innerHTML = '<span>▶</span> Start Break';
        this.updateDisplay();
    }

    updateDisplay() {
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = this.timeRemaining % 60;
        
        document.getElementById('timerMinutes').textContent = minutes.toString().padStart(2, '0');
        document.getElementById('timerSeconds').textContent = seconds.toString().padStart(2, '0');
        
        // Update progress circle
        const progress = (this.totalTime - this.timeRemaining) / this.totalTime;
        const circumference = 2 * Math.PI * 90; // radius = 90
        const offset = circumference * (1 - progress);
        
        const progressCircle = document.getElementById('timerProgress');
        progressCircle.style.strokeDasharray = circumference;
        progressCircle.style.strokeDashoffset = offset;
    }

    timerComplete() {
        this.isRunning = false;
        clearInterval(this.intervalId);
        document.getElementById('startBtn').style.display = 'flex';
        document.getElementById('pauseBtn').style.display = 'none';
        document.getElementById('startBtn').innerHTML = '<span>▶</span> Start Break';
        
        // Show completion notification
        this.showCompletionNotification();
        
        // Reset timer
        this.timeRemaining = this.totalTime;
        this.updateDisplay();
    }

    showCompletionNotification() {
        // Create a simple notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #48bb78;
            color: white;
            padding: 20px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            z-index: 10000;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        `;
        notification.textContent = '✅ Break completed! Well done!';
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    showActivityGuide(activity) {
        const guide = document.getElementById('activityGuide');
        const guides = ['breathingGuide', 'stretchGuide', 'eyesGuide', 'walkGuide'];
        
        // Hide all guides
        guides.forEach(id => {
            document.getElementById(id).style.display = 'none';
        });
        
        // Show selected guide
        const guideMap = {
            'breathing': 'breathingGuide',
            'stretch': 'stretchGuide', 
            'eyes': 'eyesGuide',
            'walk': 'walkGuide'
        };
        
        const targetGuide = guideMap[activity];
        if (targetGuide) {
            document.getElementById(targetGuide).style.display = 'block';
            guide.style.display = 'flex';
            this.selectedActivity = activity;
            
            if (activity === 'breathing') {
                this.startBreathingAnimation();
            }
        }
    }

    startBreathingAnimation() {
        const circle = document.querySelector('.breath-circle');
        if (circle) {
            circle.style.animation = 'breathe 12s infinite';
        }
    }
}

// Global function for closing activity guide
function closeActivityGuide() {
    document.getElementById('activityGuide').style.display = 'none';
}

// Initialize the timer when page loads
document.addEventListener('DOMContentLoaded', () => {
    new BreakTimer();
});

// Add some encouraging messages
const motivationalMessages = [
    "Taking breaks isn't a sign of weakness—it's a sign of wisdom.",
    "Your mind and body will thank you for this moment of care.",
    "Rest is not idleness, and to lie sometimes on the grass is no waste of time.",
    "Take care of your body. It's the only place you have to live.",
    "A break is not a luxury, it's a necessity for peak performance.",
    "Sometimes the most productive thing you can do is relax."
];

// Randomly update motivational text every few seconds
setInterval(() => {
    const motivationText = document.querySelector('.motivation-text');
    if (motivationText) {
        const randomMessage = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
        motivationText.textContent = randomMessage;
    }
}, 30000); // Every 30 seconds