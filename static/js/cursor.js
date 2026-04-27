/**
 * Zyviora Companion Custom Cursor - Advanced Edition
 * Features SVG Face Orb and Canvas-based glowing fluid tail.
 */

document.addEventListener('DOMContentLoaded', () => {

    // 1. Inject CSS Dynamically
    const style = document.createElement('style');
    style.innerHTML = `
        body, a, button, input, textarea {
            cursor: none !important;
        }

        /* SVG Cursor Face container */
        .zyv-cursor-face {
            position: fixed;
            top: 0; left: 0;
            width: 44px; height: 44px;
            pointer-events: none;
            z-index: 999999;
            transform: translate(-50%, -50%);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.1s ease-out;
        }

        /* Hover interaction */
        .zyv-cursor-face.is-hovering {
            transform: translate(-50%, -50%) scale(1.3);
        }
        .zyv-cursor-face.is-clicking {
            transform: translate(-50%, -50%) scale(0.8);
        }

        /* Absolute full-screen canvas for the fluid tail */
        #zyv-cursor-canvas {
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            pointer-events: none;
            z-index: 999998;
        }
    `;
    document.head.appendChild(style);

    // 2. Inject DOM Elements
    // The canvas for the tail
    const canvas = document.createElement('canvas');
    canvas.id = 'zyv-cursor-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // The SVG Face Orb Matches the requested image perfectly
    const cursorFace = document.createElement('div');
    cursorFace.className = 'zyv-cursor-face';
    cursorFace.innerHTML = `
        <svg viewBox="0 0 100 100" width="100%" height="100%" style="filter: drop-shadow(0 0 8px rgba(0,219,222,0.8));">
            <!-- Glowing gradient definition -->
            <defs>
                <linearGradient id="orbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#00dbde" />
                    <stop offset="100%" stop-color="#fc00ff" />
                </linearGradient>
            </defs>
            <!-- Main Hollow Circle -->
            <circle cx="50" cy="50" r="40" fill="none" stroke="url(#orbGrad)" stroke-width="4" />
            <!-- Eyes -->
            <circle cx="35" cy="45" r="4" fill="#ffffff" style="filter: drop-shadow(0 0 3px #fff);" />
            <circle cx="65" cy="45" r="4" fill="#ffffff" style="filter: drop-shadow(0 0 3px #fff);" />
            <!-- Smile -->
            <path d="M 40 60 Q 50 68 60 60" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" style="filter: drop-shadow(0 0 2px #fff);" />
            <!-- Little Leaf/Sparkle on bottom right edge -->
            <path d="M 80 80 Q 95 75 90 90 Q 75 95 80 80 Z" fill="none" stroke="#00dbde" stroke-width="2" />
        </svg>
    `;
    document.body.appendChild(cursorFace);

    // 3. Variables for tracking and tail drawing
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let currentX = mouseX;
    let currentY = mouseY;
    
    // Trail history array
    const trail = [];
    const trailLength = 20;

    window.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    // 4. Animation Loop
    function render() {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Smooth Lerp for main cursor face
        currentX += (mouseX - currentX) * 0.3;
        currentY += (mouseY - currentY) * 0.3;
        cursorFace.style.left = currentX + 'px';
        cursorFace.style.top = currentY + 'px';

        // Update trail history
        trail.push({ x: currentX, y: currentY });
        if (trail.length > trailLength) {
            trail.shift();
        }

        // Draw smooth trailing fluid curve
        if (trail.length > 1) {
            ctx.beginPath();
            ctx.moveTo(trail[0].x, trail[0].y);
            
            for (let i = 1; i < trail.length - 1; i++) {
                const xc = (trail[i].x + trail[i + 1].x) / 2;
                const yc = (trail[i].y + trail[i + 1].y) / 2;
                ctx.quadraticCurveTo(trail[i].x, trail[i].y, xc, yc);
            }
            // Curve through the last point
            ctx.quadraticCurveTo(
                trail[trail.length - 1].x, 
                trail[trail.length - 1].y, 
                currentX, currentY
            );

            // Style the glowing tail line
            const grad = ctx.createLinearGradient(trail[0].x, trail[0].y, currentX, currentY);
            grad.addColorStop(0, "rgba(252, 0, 255, 0)"); // Fades out at the end of the tail
            grad.addColorStop(1, "rgba(0, 219, 222, 0.8)"); // Bright at the head

            ctx.strokeStyle = grad;
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#00dbde';
            ctx.stroke();

            // Draw a tiny trailing dot at the very end of the tail (oldest point)
            const tailEnd = trail[0];
            ctx.beginPath();
            ctx.arc(tailEnd.x, tailEnd.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#fc00ff';
            ctx.shadowColor = '#fc00ff';
            ctx.shadowBlur = 8;
            ctx.fill();
        }

        requestAnimationFrame(render);
    }
    render();

    // 5. Global Interactive States (Hover / Click)
    document.addEventListener('mousedown', () => cursorFace.classList.add('is-clicking'));
    document.addEventListener('mouseup', () => cursorFace.classList.remove('is-clicking'));

    document.addEventListener('mouseover', (e) => {
        const interactive = e.target.closest('a, button, input, textarea, .pill, .control-item');
        if (interactive) {
            cursorFace.classList.add('is-hovering');
        } else {
            cursorFace.classList.remove('is-hovering');
        }
    });

    document.addEventListener('mouseout', (e) => {
        if (!e.relatedTarget) cursorFace.classList.remove('is-hovering');
    });
});
