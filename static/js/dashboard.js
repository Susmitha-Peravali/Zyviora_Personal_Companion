const CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]')?.content;

document.addEventListener('DOMContentLoaded', () => {
    // ─── Auth Guard ───────────────────────────────
    if (!localStorage.getItem('zyviora_logged_in')) {
        window.location.href = '/login';
        return;
    }

    // Show username greeting
    let displayName = localStorage.getItem('zyviora_fullname') || localStorage.getItem('zyviora_username') || 'Friend';
    if (displayName.includes('@')) {
        displayName = displayName.split('@')[0];
    }
    
    // Capitalize the first letter for aesthetics
    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
    
    const welcomeEl = document.getElementById('welcome-name');
    if (welcomeEl) welcomeEl.textContent = `👋 Hi, ${displayName}!`;

    // ─── Email verification reminder (soft — never blocks account use) ───
    const verifyBanner = document.getElementById('verify-email-banner');
    if (verifyBanner && localStorage.getItem('zyviora_email_verified') === 'false') {
        verifyBanner.style.display = 'block';
    }

    // ─── Logout ───────────────────────────────────
    document.getElementById('logout-btn').addEventListener('click', async () => {
        // Sync localStorage data to backend before logging out
        const localData = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            localData[key] = localStorage.getItem(key);
        }
        try {
            await fetch('/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_TOKEN },
                body: JSON.stringify(localData)
            });
        } catch (e) { console.warn('Sync before logout failed:', e); }

        await fetch('/logout', { method: 'POST', headers: { 'X-CSRFToken': CSRF_TOKEN } });
        localStorage.removeItem('zyviora_logged_in');
        localStorage.removeItem('zyviora_username');
        window.location.href = '/login';
    });

    renderMoodChart();
    renderGoalsChart();
    renderGoalsList();
    populateLearningInsights();
    renderTasksSummary();
    renderRemindersSummary();
    renderSkillPaths();
});

function renderGoalsList() {
    const goalList = document.getElementById('goal-list');
    const completedList = document.getElementById('completed-goal-list');
    if (!goalList || !completedList) return;

    try {
        const goals = JSON.parse(localStorage.getItem('zyviora_goals')) || [];
        const today = new Date().toDateString();
        const pending = goals.filter(g => !(g.completedToday || g.lastCompleted === today));
        const completed = goals.filter(g => g.completedToday || g.lastCompleted === today);

        goalList.innerHTML = pending.length === 0
            ? '<li>No pending goals!</li>'
            : pending.map(g => `<li>🎯 ${g.text}</li>`).join('');

        completedList.innerHTML = completed.length === 0
            ? '<li>No goals completed today.</li>'
            : completed.map(g => `<li style="text-decoration:line-through;opacity:0.7;">✅ ${g.text}</li>`).join('');
    } catch (e) {
        console.error('Error rendering goals list:', e);
    }
}

function renderMoodChart() {
    let rawMoods = localStorage.getItem('zyviora_mood_log');
    if (!rawMoods || JSON.parse(rawMoods).length === 0) {
        document.getElementById('moodChart').parentElement.innerHTML = '<p style="text-align:center; color:var(--text-secondary); margin-top:30px;">Chat with Zyviora to log your first mood! 🌟</p>';
        return;
    }
    const moods = JSON.parse(rawMoods).slice(-7);

    const emojiMap = { great: 5, good: 4, okay: 3, low: 2, sad: 1 };
    const labels = moods.map(m => {
        const d = new Date(m.date || m.ts);
        return isNaN(d) ? m.date : `${d.getMonth() + 1}-${d.getDate()}`;
    });
    const data = moods.map(m => emojiMap[m.mood] || 3);

    const ctx = document.getElementById('moodChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Mood (1-5)',
                data,
                borderColor: '#a777e3',
                backgroundColor: 'rgba(167, 119, 227, 0.15)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#a777e3',
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { min: 0, max: 6, ticks: { color: '#636e72' }, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { ticks: { color: '#636e72' }, grid: { color: 'rgba(0,0,0,0.05)' } }
            },
            plugins: { legend: { labels: { color: '#2d3436' } } }
        }
    });
}

function renderGoalsChart() {
    let rawGoals = localStorage.getItem('zyviora_goals');
    let completed = 0, pending = 0;
    if (rawGoals) {
        JSON.parse(rawGoals).forEach(g => {
            if (g.completedToday || g.lastCompleted === new Date().toDateString()) completed++;
            else pending++;
        });
    }
    let isEmpty = false;
    if (completed === 0 && pending === 0) {
        isEmpty = true;
    }

    const ctx = document.getElementById('goalsChart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: isEmpty ? ['No Goals'] : ['Completed ✅', 'Pending ⏳'],
            datasets: [{
                data: isEmpty ? [1] : [completed, pending],
                backgroundColor: isEmpty ? ['#e0e0e0'] : ['#6e8efb', '#fd79a8'],
                borderWidth: 0,
                hoverOffset: isEmpty ? 0 : 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#2d3436', padding: 20 } }
            }
        }
    });
}

function populateLearningInsights() {
    const list = document.getElementById('insight-list');
    const insightText = document.getElementById('insight-text');
    const insights = JSON.parse(localStorage.getItem('zyviora_learning') || '{"activeHours":{},"topics":{}}');

    let totalMessages = 0;
    let maxHour = -1, maxCount = 0;
    for (const [hour, count] of Object.entries(insights.activeHours || {})) {
        totalMessages += count;
        if (count > maxCount) { maxCount = count; maxHour = parseInt(hour); }
    }

    if (totalMessages === 0) {
        insightText.textContent = 'Chat more so I can learn your patterns!';
        return;
    }

    insightText.textContent = `Based on ${totalMessages} interactions:`;

    const hourLabel = maxHour >= 0
        ? (maxHour === 0 ? '12 AM' : maxHour < 12 ? `${maxHour} AM` : maxHour === 12 ? '12 PM' : `${maxHour - 12} PM`)
        : '';

    const items = [];
    if (hourLabel) items.push(`🕗 You usually chat around <strong>${hourLabel}</strong>.`);

    const topics = insights.topics || {};
    const topTopic = Object.entries(topics).sort((a, b) => b[1] - a[1])[0];
    if (topTopic) items.push(`💬 Most discussed topic: <strong>${topTopic[0]}</strong>.`);

    // Mood trend note
    const rawMoods = localStorage.getItem('zyviora_mood_log');
    if (rawMoods) {
        const moods = JSON.parse(rawMoods).slice(-5);
        const neg = moods.filter(m => ['sad', 'low'].includes(m.mood)).length;
        const pos = moods.filter(m => ['great', 'good'].includes(m.mood)).length;
        if (neg >= 3) items.push(`💙 You've had some tough days recently. I'm here for you.`);
        else if (pos >= 4) items.push(`🌟 You've been in a great mood recently — keep it up!`);
    }

    if (items.length === 0) { insightText.textContent = 'Not enough data yet — check back soon!'; return; }
    items.forEach(text => {
        const li = document.createElement('li');
        li.innerHTML = text;
        list.appendChild(li);
    });
}

window.deleteTask = function(taskId) {
    if(!confirm("Delete this task?")) return;
    let tasks = JSON.parse(localStorage.getItem('zyviora_tasks')) || [];
    tasks = tasks.filter(t => t.id !== taskId);
    localStorage.setItem('zyviora_tasks', JSON.stringify(tasks));
    
    // Re-render chart and lists
    document.getElementById('goalsChart').parentElement.innerHTML = '<canvas id="goalsChart"></canvas>';
    renderGoalsChart();
    renderTasksSummary();
};

window.toggleTaskStatus = function(taskId) {
    let tasks = JSON.parse(localStorage.getItem('zyviora_tasks')) || [];
    const task = tasks.find(t => t.id === taskId);
    if(task) {
        task.status = task.status === 'pending' ? 'completed' : 'pending';
        if (task.status === 'completed') task.lastCompleted = new Date().toDateString();
        localStorage.setItem('zyviora_tasks', JSON.stringify(tasks));
        
        document.getElementById('goalsChart').parentElement.innerHTML = '<canvas id="goalsChart"></canvas>';
        renderGoalsChart();
        renderTasksSummary();
    }
};

function renderTasksSummary() {
    const taskList = document.getElementById('task-list');
    const completedList = document.getElementById('completed-task-list');
    if(!taskList || !completedList) return;
    
    try {
        const tasks = JSON.parse(localStorage.getItem('zyviora_tasks')) || [];
        const pending = tasks.filter(t => t.status === 'pending');
        const completed = tasks.filter(t => t.status === 'completed');
        
        taskList.innerHTML = '';
        completedList.innerHTML = '';
        
        if (pending.length === 0) {
            taskList.innerHTML = '<li>No pending tasks! 🎉</li>';
        } else {
            pending.forEach(t => {
                const li = document.createElement('li');
                li.style.borderBottom = '1px solid rgba(0,0,0,0.05)';
                li.style.padding = '5px 0';
                li.style.display = 'flex';
                li.style.justifyContent = 'space-between';
                li.style.alignItems = 'center';
                li.innerHTML = `
                    <span style="cursor:pointer;" onclick="toggleTaskStatus(${t.id})">⏳ ${t.text}</span>
                    <span class="material-icons" style="cursor:pointer; font-size:16px; opacity:0.5; transition: opacity 0.2s;" onclick="deleteTask(${t.id})" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.5'">delete</span>
                `;
                taskList.appendChild(li);
            });
        }
        
        if (completed.length === 0) {
            completedList.innerHTML = '<li>No completed tasks.</li>';
        } else {
            completed.forEach(t => {
                const li = document.createElement('li');
                li.style.borderBottom = '1px solid rgba(0,0,0,0.05)';
                li.style.padding = '5px 0';
                li.style.display = 'flex';
                li.style.justifyContent = 'space-between';
                li.style.alignItems = 'center';
                li.style.textDecoration = 'line-through';
                li.style.opacity = '0.7';
                li.innerHTML = `
                    <span style="cursor:pointer;" onclick="toggleTaskStatus(${t.id})">✅ ${t.text}</span>
                    <span class="material-icons" style="cursor:pointer; font-size:16px; opacity:0.5; transition: opacity 0.2s;" onclick="deleteTask(${t.id})" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.5'">delete</span>
                `;
                completedList.appendChild(li);
            });
        }
    } catch(e) {}
}

function renderSkillPaths() {
    const list = document.getElementById('skill-path-list');
    if (!list) return;
    try {
        const paths = JSON.parse(localStorage.getItem('zyviora_skill_paths')) || [];
        if (paths.length === 0) {
            list.innerHTML = '<p style="color:var(--text-secondary);font-size:0.95rem;">No skill paths yet.</p>';
            return;
        }
        list.innerHTML = '';
        paths.forEach(p => {
            const done = p.steps.filter(s => s.completed).length;
            const pct = Math.round((done / p.steps.length) * 100);
            const wrap = document.createElement('div');
            wrap.innerHTML = `
                <div style="display:flex;justify-content:space-between;font-size:0.9rem;margin-bottom:4px;">
                    <span style="font-weight:600;color:var(--text-primary);">${p.topic}</span>
                    <span style="color:var(--text-secondary);">${done}/${p.steps.length}</span>
                </div>
                <div style="height:6px;background:rgba(0,0,0,0.08);border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:linear-gradient(135deg,#a777e3,#6e8efb);"></div>
                </div>
            `;
            list.appendChild(wrap);
        });
    } catch (e) {
        console.error('Error rendering skill paths:', e);
    }
}

function renderRemindersSummary() {
    const reminderList = document.getElementById('reminder-list');
    if(!reminderList) return;
    try {
        const reminders = JSON.parse(localStorage.getItem('zyviora_reminders')) || [];
        if (reminders.length === 0) {
            reminderList.innerHTML = '<li>No active reminders.</li>';
            return;
        }
        reminderList.innerHTML = '';
        reminders.forEach(r => {
            const li = document.createElement('li');
            li.style.borderBottom = '1px solid rgba(0,0,0,0.05)';
            li.style.padding = '5px 0';
            const date = new Date(r.triggerAt);
            const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            li.innerHTML = `<strong>⏰ ${timeStr}</strong>: ${r.task}`;
            reminderList.appendChild(li);
        });
    } catch(e) {}
}
