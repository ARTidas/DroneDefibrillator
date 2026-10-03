document.addEventListener("DOMContentLoaded", function() {
    
    // 1. Térkép inicializálása
    const map = L.map('map').setView([47.1625, 19.5033], 7);

    // Letisztult (CartoDB) háttértérkép betöltése
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=cb1_484l_1_4f3522bc5e5aab9c76aa66b6', {
        maxZoom: 19,
        attribution: '© CARTO'
    }).addTo(map);

    function logEvent(message) {
        const logList = document.getElementById('log_list');
        const newItem = document.createElement('li');
        const time = new Date().toLocaleTimeString();
        newItem.textContent = `[${time}] ${message}`;
        logList.prepend(newItem);
    }

    logEvent("Map initialized.");

    // 2. Adatok betöltése aszinkron módon
    fetch('data/heatmap_data.json')
    .then(response => response.json())
    .then(data => {
        // A Turf.js rács határai (kiterjesztett bbox, hogy a széleken is legyen matematikai rács)
        const hungaryBbox = [16.0, 45.7, 23.0, 48.6];
        //const hungaryBbox = [15.0, 45.0, 24.0, 49.0];

        // Adatok pontokká alakítása
        const points = data.map(row => 
            turf.point([row.longitude, row.latitude], { density: row.density_category_id })
        );
        const pointsCollection = turf.featureCollection(points);

        // Rács generálása (Túl fog lógni az országon)
        const grid = turf.interpolate(pointsCollection, 5, {
            gridType: 'points',
            property: 'density',
            units: 'kilometers',
            weight: 2,
            bbox: hungaryBbox 
        });

        const breaks = [0, 1.5, 2.5, 3.5, 4.5, 6];
        const isobands = turf.isobands(grid, breaks, { zProperty: 'density' });

        function getColor(value) {
            if (value === "4.5-6") return '#800026'; // Nagyon sűrű
            if (value === "3.5-4.5") return '#BD0026';
            if (value === "2.5-3.5") return '#FC4E2A';
            if (value === "1.5-2.5") return '#FD8D3C';
            return '#FFEDA0';                        // Nagyon ritka
        }

        // --- MASZKOLÁS (Cookie Cutter) KEZDETE ---
        // Megvizsgáljuk, hogy a geojson_data_hungary_boundary.js betöltötte-e a "hungaryBoundary" változót
        if (typeof hungaryBoundary !== 'undefined') {
            logEvent("Országhatár poligon megtalálva, vágás folyamatban...");
            
            // Kinyerjük a konkrét poligont a FeatureCollection-ből
            let maskPolygon = hungaryBoundary;
            if (hungaryBoundary.type === "FeatureCollection") {
                maskPolygon = hungaryBoundary.features[0];
            }

            let clippedFeatures = [];
            
            // Végigmegyünk az összes izoband gyűrűn és elmetsszük az országhatárral
            turf.featureEach(isobands, function (currentIsoband) {
                try {
                    // Metszetképzés: csak a közös rész marad meg
                    let clipped = turf.intersect(currentIsoband, maskPolygon);
                    if (clipped) {
                        // Visszatesszük a sűrűség adatot (mert a metszéskor törlődik)
                        clipped.properties = currentIsoband.properties;
                        clippedFeatures.push(clipped);
                    }
                } catch (e) {
                    console.warn("Vágási hiba egy poligonon", e);
                }
            });

            // Kicseréljük az eredeti gyűrűket a levágottakra
            isobands.features = clippedFeatures;
        } else {
            logEvent("Figyelem: hungaryBoundary változó hiányzik. Vágás kihagyva.");
        }
        // --- MASZKOLÁS VÉGE ---

        // 3. Kirajzolás a térképre
        L.geoJSON(isobands, {
            style: function (feature) {
                return {
                    fillColor: getColor(feature.properties.density),
                    weight: 1, 
                    opacity: 0.9, 
                    color: '#ccc', 
                    fillOpacity: 0.3 
                };
            }
        }).addTo(map);

        // (Opcionális) Országhatár körvonalának rárajzolása, hogy még szebb legyen
        if (typeof hungaryBoundary !== 'undefined') {
            L.geoJSON(hungaryBoundary, {
                style: {
                    color: '#333333',
                    weight: 2,
                    fillOpacity: 0 // Belül átlátszó, csak keret
                }
            }).addTo(map);
        }

        logEvent(`Sűrűségi zónák generálva és maszkolva.`);
    })
    .catch(error => {
        console.error("Hiba az isoband réteg készítésekor:", error);
    });

    // 4. Interaktív Drón Bázis Szimuláció
    const baseCoords = [47.4980, 19.0487]; 
    const droneSpeedKmh = 100;
    const maxFlightTimeMinutes = 3;
    const radiusMeters = (droneSpeedKmh / 60) * maxFlightTimeMinutes * 1000; 

    const droneMarker = L.marker(baseCoords, {
        draggable: true,
        title: "Drone AED Base"
    }).addTo(map);

    const coverageCircle = L.circle(baseCoords, {
        color: 'green',
        fillColor: '#32cd32',
        fillOpacity: 0.3,
        radius: radiusMeters 
    }).addTo(map);

    droneMarker.on('drag', function(e) {
        const newLatLng = e.latlng;
        coverageCircle.setLatLng(newLatLng);
    });

    droneMarker.on('dragend', function(e) {
        const finalLatLng = e.target.getLatLng();
        logEvent(`Bázis áthelyezve: Lat ${finalLatLng.lat.toFixed(4)}, Lng ${finalLatLng.lng.toFixed(4)}`);
    });
});