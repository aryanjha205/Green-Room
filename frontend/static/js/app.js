let map, markers = [];

async function initApp() {
    initMap();
    await fetchListings();
    
    // Geolocation detection
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            console.log("Location detected:", latitude, longitude);
            // Re-fetch sorted by distance
            fetchListings(latitude, longitude);
        }, err => {
            console.warn("Geolocation denied or unavailable:", err.message);
        });
    }
}

function initMap() {
    // Default center Mumbai
    map = L.map('map-container').setView([19.0760, 72.8777], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}



function renderListings(listings) {
    const grid = document.getElementById('listing-grid');
    grid.innerHTML = '';
    
    if (listings.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: var(--text-gray); width: 100%;">No rooms found in your area yet.</p>';
        return;
    }

    listings.forEach((room, idx) => {
        const card = document.createElement('div');
        card.className = 'property-card fade-up';
        card.style.animationDelay = `${idx * 0.05}s`;
        
        const firstImg = room.images && room.images.length > 0 ? room.images[0] : null;
        const imageUrl = firstImg 
            ? (firstImg.startsWith('http') ? firstImg : `/uploads/${firstImg}`) 
            : 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=400';

        card.innerHTML = `
            <div class="card-img-container">
                <img src="${imageUrl}" alt="${room.title}" loading="lazy">
                <div class="price-tag">₹${room.price.toLocaleString()} / mo</div>
            </div>
            <div class="card-content">
                <h3 class="card-title">${room.title}</h3>
                <div class="card-location">
                    <i data-lucide="map-pin" size="14"></i> 
                    ${room.distance ? `${room.distance.toFixed(1)} km away` : 'Near you'}
                </div>
                <div class="card-stats">
                    <div style="margin-bottom: 8px; font-weight: 600; color: var(--text-dark); display: flex; align-items: center; gap: 5px;">
                        <i data-lucide="user" size="14" style="color: var(--primary);"></i> ${room.owner_name}
                    </div>
                </div>
                <div class="card-stats">
                    <span style="display:flex; align-items:center; gap:4px;"><i data-lucide="shield-check" size="14" style="color:var(--primary);"></i> No Brokerage</span>
                    <a href="tel:${room.owner_phone}" class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem; text-decoration: none; width: auto; display: inline-flex; align-items: center; gap: 5px;">
                        <i data-lucide="phone" size="14"></i> Call Owner
                    </a>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
    
    lucide.createIcons();
}

function updateMapMarkers(listings) {
    // Clear old markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    listings.forEach(room => {
        if(room.lat && room.lon) {
            const firstImg = room.images && room.images.length > 0 ? room.images[0] : '';
            const imgPath = firstImg.startsWith('http') ? firstImg : `/uploads/${firstImg}`;
            const marker = L.marker([room.lat, room.lon]).addTo(map);
            marker.bindPopup(`
                <div style="min-width: 180px; font-family: 'Outfit';">
                    <img src="${imgPath}" style="width: 100%; height: 90px; object-fit: cover; border-radius: 12px; margin-bottom: 8px;">
                    <div style="font-weight: 700; color: var(--primary);">₹${room.price} / mo</div>
                    <div style="font-weight: 600; margin: 4px 0;">${room.title}</div>
                    <div style="font-size: 0.8rem; color: #666; margin-bottom: 8px;">Owner: ${room.owner_name}</div>
                    <a href="tel:${room.owner_phone}" style="width: 100%; background: var(--primary); color: white; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; border-radius: 8px; font-weight: 600;">
                        <i data-lucide="phone" size="16"></i> Contact Owner
                    </a>
                </div>
            `);
            markers.push(marker);
        }
    });

    if(markers.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

// Simple Filter Shells
// Simple Filter Shells
let currentListings = [];

async function fetchListings(lat = null, lon = null) {
    let url = '/api/listings';
    if(lat && lon) url += `?lat=${lat}&lon=${lon}`;
    
    try {
        const response = await fetch(url);
        currentListings = await response.json();
        renderListings(currentListings);
        updateMapMarkers(currentListings);
        document.getElementById('room-count').innerText = `${currentListings.length} Results`;
    } catch (e) {
        console.error("Failed to load listings", e);
    }
}

function filterListings(type) {
    // Reset active filters
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');

    if(type === 'nearest') {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(p => fetchListings(p.coords.latitude, p.coords.longitude));
        }
    } else {
        fetchListings();
    }
}

function toggleFilter(type) {
    const btn = event.target;
    btn.classList.toggle('active');
    
    let filtered = [...currentListings];
    
    if (type === 'price_low') {
        filtered.sort((a, b) => a.price - b.price);
    } else if (type === 'radius_5k') {
        filtered = filtered.filter(item => !item.distance || item.distance <= 5);
    }
    
    renderListings(filtered);
    updateMapMarkers(filtered);
    document.getElementById('room-count').innerText = `${filtered.length} Results`;
}

// Run init
document.addEventListener('DOMContentLoaded', initApp);
