document.addEventListener("DOMContentLoaded", () => {
    // 1. Inject CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'modern-ui.css';
    document.head.appendChild(link);

    // 2. Setup Theme Logic
    const savedTheme = localStorage.getItem('portalTheme') || 'dark';
    if (savedTheme === 'light') document.body.classList.add('light-theme');

    window.toggleTheme = () => {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        localStorage.setItem('portalTheme', isLight ? 'light' : 'dark');
    };

    // 3. Inject Top Bar for Theme Switcher & Restructure
    setTimeout(() => {
        const wrappers = ['dashboard-wrapper', 'staff-dashboard-wrapper', 'student-dashboard-wrapper'];
        wrappers.forEach(wId => {
            const wrapper = document.getElementById(wId);
            if (!wrapper) return;

            const contentArea = wrapper.querySelector('.mock-content') || wrapper.querySelector('.ops-content');
            if (contentArea && !contentArea.querySelector('.modern-top-bar')) {
                const topBar = document.createElement('div');
                topBar.className = 'modern-top-bar';
                topBar.innerHTML = 
                    <div class="top-bar-left">
                        <h2 class="text-lg font-bold text-gray-200" style="color: var(--theme-text)">Dashboard</h2>
                    </div>
                    <div class="top-bar-right flex items-center gap-4">
                        <button class="theme-toggle-btn" onclick="toggleTheme()" title="Change Theme">
                            <i class="fas fa-palette"></i>
                        </button>
                    </div>
                ;
                contentArea.insertBefore(topBar, contentArea.firstChild);
            }

            // Mobile Hamburger Logic
            const hamb = wrapper.querySelector('.hamb');
            const nav = wrapper.querySelector('.nav-scroll');
            if (hamb && nav) {
                hamb.addEventListener('click', () => {
                    nav.classList.toggle('mobile-open');
                });
            }
        });
    }, 500);
});
