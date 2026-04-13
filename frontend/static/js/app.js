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

    // Ensure icons in popups are rendered
    map.on('popupopen', () => lucide.createIcons());
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
                <img src="${imageUrl}" alt="${room.title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=400'">
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
                <div style="min-width: 200px; font-family: 'Outfit';">
                    <img src="${imgPath}" alt="${room.title}" onerror="this.src='https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=400'" style="width: 100%; height: 110px; object-fit: cover; border-radius: 12px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <div style="font-weight: 700; color: var(--primary);">₹${room.price.toLocaleString()}</div>
                        <div style="font-size: 0.75rem; color: #666;">By ${room.owner_name}</div>
                    </div>
                    <div style="font-weight: 600; margin-bottom: 8px; font-size: 0.9rem;">${room.title}</div>
                    
                    <div style="background: #f9fafb; padding: 10px; border-radius: 10px; border: 1px solid #eee;">
                        <textarea id="msg-${room._id}" placeholder="Ask about availability..." style="width: 100%; border: none; background: transparent; font-size: 0.8rem; outline: none; resize: none; height: 40px;"></textarea>
                        <button onclick="sendInquiry('${room._id}')" id="btn-${room._id}" style="width: 100%; background: var(--primary); color: white; border: none; padding: 8px; border-radius: 8px; font-weight: 600; font-size: 0.8rem; cursor: pointer; margin-top: 5px; display: flex; align-items: center; justify-content: center; gap: 5px;">
                            <i data-lucide="send" size="14"></i> Send Message
                        </button>
                    </div>

                    <a href="tel:${room.owner_phone}" style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; margin-top: 10px; color: var(--primary); text-decoration: none; font-weight: 600; font-size: 0.85rem; border: 1px solid var(--primary); border-radius: 8px;">
                        <i data-lucide="phone" size="16"></i> Call Owner
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
    lucide.createIcons();
}

async function sendInquiry(listingId) {
    const textarea = document.getElementById(`msg-${listingId}`);
    const btn = document.getElementById(`btn-${listingId}`);
    const message = textarea.value.trim();

    if (!message) {
        alert("Please type a message first.");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Sending...';
    lucide.createIcons();

    try {
        const resp = await fetch(`/api/listings/${listingId}/inquiry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        const data = await resp.json();
        
        if (data.success) {
            btn.style.background = '#22c55e';
            btn.innerHTML = '<i data-lucide="check" size="14"></i> Message Sent!';
            textarea.value = '';
            setTimeout(() => map.closePopup(), 1500);
        } else {
            alert("Error: " + data.message);
            btn.disabled = false;
            btn.innerHTML = 'Send Message';
        }
    } catch (e) {
        alert("Failed to send inquiry.");
        btn.disabled = false;
        btn.innerHTML = 'Send Message';
    }
    lucide.createIcons();
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
