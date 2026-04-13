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

async function fetchListings(lat = null, lon = null) {
    let url = '/api/listings';
    if(lat && lon) url += `?lat=${lat}&lon=${lon}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        renderListings(data);
        updateMapMarkers(data);
        document.getElementById('room-count').innerText = `${data.length} Results`;
    } catch (e) {
        console.error("Failed to load listings", e);
    }
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
                    ${room.distance ? `${room.distance.toFixed(1)} km away` : 'Location available'}
                </div>
                <div class="card-stats">
                    <span style="display:flex; align-items:center; gap:4px;"><i data-lucide="shield-check" size="14" style="color:var(--primary);"></i> No Brokerage</span>
                    <span style="display:flex; align-items:center; gap:4px;"><i data-lucide="zap" size="14" style="color:#FFA000;"></i> Top Rated</span>
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
                <div style="min-width: 150px; font-family: 'Outfit';">
                    <img src="${imgPath}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 8px; margin-bottom: 8px;">
                    <b style="color: var(--primary);">${room.title}</b><br>
                    <span style="font-weight: 700;">₹${room.price} / mo</span><br>
                    <span style="font-size: 0.8rem; color: #666;">Deposit: ₹${room.deposit}</span><br>
                    <button style="width: 100%; background: var(--primary); color: white; border: none; padding: 5px; border-radius: 5px; margin-top: 5px; cursor: pointer;">View Contact</button>
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
function filterListings(type) {
    if(type === 'nearest') {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(p => fetchListings(p.coords.latitude, p.coords.longitude));
        }
    } else {
        fetchListings();
    }
}

// Run init
document.addEventListener('DOMContentLoaded', initApp);
