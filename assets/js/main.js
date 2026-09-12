// Load and render dynamic content
(function() {
    'use strict';

    // Load JSON data
    async function loadJSON(url) {
        try {
            const response = await fetch(url);
            return await response.json();
        } catch (error) {
            console.error('Error loading', url, ':', error);
            return null;
        }
    }

    // Load translated section data when the current page is Chinese.
    function loadLocalizedJSON(name) {
        const isChinese = document.documentElement.lang.toLowerCase().startsWith('zh');
        const localeSuffix = isChinese ? '.zh' : '';
        return loadJSON(`/assets/data/${name}${localeSuffix}.json`);
    }


    // Render News
    async function renderNews() {
        const newsContainer = document.getElementById('news-container');
        if (!newsContainer) return;

        const news = await loadLocalizedJSON('news');
        if (!news) return;

        news.forEach(item => {
            const newsItem = document.createElement('div');
            newsItem.className = 'news-item';
            newsItem.innerHTML = `
                <span class="news-date">${item.date}</span>
                <span class="news-text">${item.text}</span>
            `;
            newsContainer.appendChild(newsItem);
        });
    }

    // Render Experience
    async function renderExperience() {
        const container = document.getElementById('experience-container');
        if (!container) return;

        const data = await loadLocalizedJSON('experience');
        if (!data) return;

        data.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `<b>${item.period}</b> &mdash; ${item.title}`;
            container.appendChild(li);
        });
    }

    // Render Awards
    async function renderAwards() {
        const container = document.getElementById('awards-container');
        if (!container) return;

        const data = await loadLocalizedJSON('awards');
        if (!data) return;

        data.forEach(item => {
            const li = document.createElement('li');
            if (item.highlight) {
                li.innerHTML = `<span class="award">${item.name}</span>, ${item.year}`;
            } else {
                li.innerHTML = `${item.name}, ${item.year}`;
            }
            container.appendChild(li);
        });
    }

    // Render Service
    async function renderService() {
        const container = document.getElementById('service-container');
        if (!container) return;

        const data = await loadLocalizedJSON('service');
        if (!data) return;

        data.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `${item.role}: ${item.venue}`;
            container.appendChild(li);
        });
    }

    // Render Publications
    async function renderPublications() {
        const pubContainer = document.getElementById('publications-container');
        if (!pubContainer) return;

        const pubs = await loadJSON('/assets/data/publications.json');
        if (!pubs) return;

        // Sort years in descending order
        const years = Object.keys(pubs).sort((a, b) => b - a);

        years.forEach(year => {
            // Create year group
            const yearGroup = document.createElement('div');
            yearGroup.className = 'pub-year-group';

            // Create year label
            const yearLabel = document.createElement('div');
            yearLabel.className = 'pub-year-label';
            yearLabel.textContent = year;

            // Create year content
            const yearContent = document.createElement('div');
            yearContent.className = 'pub-year-content';

            pubs[year].forEach(pub => {
                const pubItem = document.createElement('div');
                pubItem.className = 'pub-item';

                // Build links HTML
                let linksHtml = '';
                if (pub.links && pub.links.length > 0) {
                    linksHtml = pub.links.map(link =>
                        ` <a href="${link.url}" target="_blank">[${link.name}]</a>`
                    ).join('');
                }

                pubItem.innerHTML = `
                    <div class="pub-header">
                        <span class="pub-badge">${pub.venue}</span>
                        ${pub.ccf ? `<span class="pub-ccf-badge pub-ccf-${pub.ccf.toLowerCase().replace('ccf-', '')}">${pub.ccf}</span>` : ''}
                        <div class="pub-title">${pub.title}${linksHtml}</div>
                    </div>
                    <div class="pub-authors">${pub.authors}</div>
                    <div class="pub-venue">${pub.full_venue || ''}</div>
                `;
                yearContent.appendChild(pubItem);
            });

            yearGroup.appendChild(yearLabel);
            yearGroup.appendChild(yearContent);
            pubContainer.appendChild(yearGroup);
        });
    }

    // Initialize
    document.addEventListener('DOMContentLoaded', function() {
        renderNews();
        renderExperience();
        renderAwards();
        renderService();
        renderPublications();
    });
})();
