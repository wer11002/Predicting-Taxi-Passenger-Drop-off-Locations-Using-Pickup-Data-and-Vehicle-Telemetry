// Global variables
let map;
let pickupZones = new Map();
let flowData = [];
let currentPickupLayers = [];
let currentFlowLayers = [];
let selectedPickupKey = null;
let currentFlows = []; // NEW: To store the currently visible flows for the click handler

// Initialize the Leaflet map
function initMap() {
    map = L.map('map').setView([40.7128, -74.0060], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    map.on('click', (e) => {
        if (e.originalEvent.target === map.getContainer()) {
            clearSelection();
        }
    });
}

// Fetch and parse the CSV data
async function loadCSVData() {
    try {
        const response = await fetch('/data');
        if (!response.ok) throw new Error(`Network response error`);
        
        const csvText = await response.text();
        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            complete: (results) => {
                console.log('CSV data parsed:', results.data.length, 'rows');
                processData(results.data);
                document.getElementById('loading').style.display = 'none';
            },
            error: (error) => console.error('Error parsing CSV:', error)
        });
    } catch (error) {
        console.error('Error loading CSV data:', error);
    }
}

// Process the parsed data to create pickup zones
function processData(data) {
    flowData = data;

    data.forEach((row, index) => {
        const pickupLat = parseFloat(row.pickup_centroid_lat || row.pickup_lat || row.pickup_center_lat);
        const pickupLon = parseFloat(row.pickup_centroid_lon || row.pickup_lon || row.pickup_center_lon);
        
        if (isNaN(pickupLat) || isNaN(pickupLon)) {
            console.warn(`Skipping row ${index + 1} due to invalid pickup coordinates.`);
            return;
        }

        const pickupId = row.pickup_cluster_id || row.pickup_zone_id || row.pickup_id;
        const pickupRadius = parseFloat(row.pickup_radius_meters || row.pickup_radius || 500);
        
        const pickupKey = `${pickupLat.toFixed(6)}_${pickupLon.toFixed(6)}`;
        
        if (!pickupZones.has(pickupKey)) {
            pickupZones.set(pickupKey, {
                id: pickupId,
                lat: pickupLat,
                lon: pickupLon,
                radius: pickupRadius,
                key: pickupKey
            });
        }
    });

    console.log(`Created ${pickupZones.size} unique pickup zones.`);
    drawPickupZones();
    fitMapToBounds();
}

// Draw the blue pickup zone circles on the map
function drawPickupZones() {
    pickupZones.forEach(zone => {
        const circle = L.circle([zone.lat, zone.lon], {
            radius: zone.radius,
            fillColor: '#00d4ff',
            color: '#0099cc',
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.4,
            className: 'pickup-circle'
        }).addTo(map);

        circle.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            selectPickupZone(zone);
        });
        
        currentPickupLayers.push(circle);
    });
}

// Handle clicking on a pickup zone
function selectPickupZone(selectedZone) {
    if (selectedPickupKey === selectedZone.key) return;
    
    selectedPickupKey = selectedZone.key;

    currentPickupLayers.forEach(layer => {
        const zoneKey = `${layer.getLatLng().lat.toFixed(6)}_${layer.getLatLng().lng.toFixed(6)}`;
        if (zoneKey === selectedZone.key) {
            layer.setStyle({ fillOpacity: 0.8, weight: 4, color: '#ff6b00' });
        } else {
            layer.setStyle({ fillOpacity: 0.4, weight: 2, color: '#0099cc' });
        }
    });
    
    // MODIFIED: Store the flows globally so the onclick handler can access them
    currentFlows = getFlowsForPickup(selectedZone);
    drawFlows(selectedZone, currentFlows);
    showInfoPanel(selectedZone, currentFlows);
}

// Find all flows for the selected pickup zone
function getFlowsForPickup(pickupZone) {
    return flowData.filter(row => {
        const lat = parseFloat(row.pickup_centroid_lat || row.pickup_lat || row.pickup_center_lat);
        const lon = parseFloat(row.pickup_centroid_lon || row.pickup_lon || row.pickup_center_lon);
        return Math.abs(lat - pickupZone.lat) < 1e-6 && Math.abs(lon - pickupZone.lon) < 1e-6;
    }).map(row => ({
        dropoffId: row.dropoff_cluster_id || row.dropoff_zone_id || row.dropoff_id,
        dropoffLat: parseFloat(row.dropoff_centroid_lat || row.dropoff_lat || row.dropoff_center_lat),
        dropoffLon: parseFloat(row.dropoff_centroid_lon || row.dropoff_lon || row.dropoff_center_lon),
        dropoffRadius: parseFloat(row.dropoff_radius_meters || row.dropoff_radius || 500),
        probability: parseFloat(row['probability_%'] || row.probability || 0)
    }))
    .sort((a, b) => b.probability - a.probability);
}

// Draw the dropoff circles and flow arrows
function drawFlows(pickupZone, flows) {
    clearFlows();

    flows.forEach(flow => {
        if (isNaN(flow.dropoffLat) || isNaN(flow.dropoffLon)) return;
        
        const line = L.polyline([[pickupZone.lat, pickupZone.lon], [flow.dropoffLat, flow.dropoffLon]], {
            color: '#ff6b00',
            weight: Math.max(2, Math.min(8, flow.probability * 0.2)),
            opacity: 0.8
        }).addTo(map);
        
        const dropoffCircle = L.circle([flow.dropoffLat, flow.dropoffLon], {
            radius: flow.dropoffRadius,
            fillColor: '#ff6b00',
            color: '#ff4500',
            weight: 2,
            opacity: 0.7,
            fillOpacity: 0.3,
            className: 'dropoff-circle'
        }).addTo(map);
        
        currentFlowLayers.push(line, dropoffCircle);
    });
}

// Display info in the sidebar
function showInfoPanel(zone, flows) {
    const infoPanel = document.getElementById('infoPanel');
    const infoTitle = document.getElementById('infoTitle');
    const flowsList = document.getElementById('flowsList');

    infoTitle.textContent = `Flows from Pickup ${zone.id || 'Zone'}`;

    if (!flows || flows.length === 0) {
        flowsList.innerHTML = '<div class="flow-item">No dropoff flows found.</div>';
    } else {
        flowsList.innerHTML = flows.map((flow, index) => {
            const hasValidId = flow.dropoffId !== null && flow.dropoffId !== undefined && flow.dropoffId !== -1;
            const zoneLabel = hasValidId ? `Zone ${flow.dropoffId}` : `Zone ${index + 1}`;

            // MODIFIED: Added onclick event to each flow item
            return `
                <div class="flow-item" onclick="focusOnDropoff(${index})">
                    <span class="flow-zone">${zoneLabel}</span>
                    <span class="flow-probability">${flow.probability.toFixed(1)}%</span>
                </div>
            `;
        }).join('');
    }

    infoPanel.style.display = 'block';
}


// --- NEW FUNCTION: Focus on a single dropoff zone ---
function focusOnDropoff(flowIndex) {
    // Make sure the flow data exists
    if (!currentFlows || !currentFlows[flowIndex]) {
        console.error("Could not find the clicked flow data.");
        return;
    }

    const targetFlow = currentFlows[flowIndex];

    // 1. Clear all existing flow lines and dropoff circles from the map
    clearFlows();

    // 2. Draw just the selected dropoff circle with a special highlight style
    const focusedDropoffCircle = L.circle([targetFlow.dropoffLat, targetFlow.dropoffLon], {
        radius: targetFlow.dropoffRadius,
        fillColor: '#FF0033', // A bright, distinct color for focus
        color: '#FFFFFF',     // A white border to make it pop
        weight: 4,             // Thicker border
        fillOpacity: 0.9
    }).addTo(map);

    // Add this single circle to the layers array so it can be cleared later
    currentFlowLayers.push(focusedDropoffCircle);

    // 3. Smoothly fly the map to the selected zone's location
    map.flyTo([targetFlow.dropoffLat, targetFlow.dropoffLon], 15); // Zoom level 15 is good for a neighborhood view
}


// Clear all flows and reset styles
function clearSelection() {
    selectedPickupKey = null;
    currentFlows = []; // Clear the stored flows
    clearFlows();
    
    currentPickupLayers.forEach(layer => {
        layer.setStyle({ fillOpacity: 0.4, weight: 2, color: '#0099cc' });
    });
    
    document.getElementById('infoPanel').style.display = 'none';
}

// Remove flow layers from the map
function clearFlows() {
    currentFlowLayers.forEach(layer => map.removeLayer(layer));
    currentFlowLayers = [];
}

// Adjust map view to show all pickup zones
function fitMapToBounds() {
    if (pickupZones.size === 0) return;

    const bounds = L.latLngBounds();
    pickupZones.forEach(zone => {
        bounds.extend([zone.lat, zone.lon]);
    });
    
    map.fitBounds(bounds, { padding: [50, 50] });
}

// Start the application
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadCSVData();
});