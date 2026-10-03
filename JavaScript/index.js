document.addEventListener("DOMContentLoaded", function() {
    
    // 1. Initialize Map centered on Hungary
    const map = L.map('map').setView([47.1625, 19.5033], 7);

    /*L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap'
    }).addTo(map);*/
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=cb1_484l_1_4f3522bc5e5aab9c76aa66b6', {
        maxZoom: 19,
        attribution: '© CARTO'
    }).addTo(map);

    // Helper function to write to your map_log div
    function logEvent(message) {
        const logList = document.getElementById('log_list');
        const newItem = document.createElement('li');
        const time = new Date().toLocaleTimeString();
        newItem.textContent = `[${time}] ${message}`;
        logList.prepend(newItem); // Add new events to the top
    }

    logEvent("Map initialized.");



    // Adatok betöltése aszinkron módon (Fetch API)
    /*fetch('../Data/heatmap_data.json')
        .then(response => {
            if (!response.ok) {
                throw new Error("Hiba a hálózatban vagy nem található a JSON fájl.");
            }
            return response.json();
        })
        .then(data => {
            // Átalakítjuk a JSON array-t a HeatMap által várt [lat, lng, intenzitás] formátumba
            const heatData = data.map(row => [row.latitude, row.longitude, row.population]);

            // Hőtérkép réteg beállítása
            const heatLayer = L.heatLayer(heatData, {
                radius: 35,       // Ezt majd finomhangold (15-50 között)
                blur: 20,         // A foltok széleinek elmosása
                maxZoom: 10,      
                max: 100000,      // ÁLLÍTSD BE: Mi számít "pirosnak" (max lakosság egy irányítószámon)
                gradient: { 
                    0.2: 'blue', 
                    0.5: 'lime', 
                    0.8: 'yellow', 
                    1.0: 'red' 
                }
            }).addTo(map);

            logEvent(`Hőtérkép betöltve: ${data.length} adatrekord alapján.`);
        })
        .catch(error => {
            console.error("Hiba az adatok betöltésekor:", error);
            logEvent("Hiba a hőtérkép betöltésekor!");
        });*/
    fetch('data/heatmap_data.json')
    .then(response => response.json())
    .then(data => {
        // 1. A saját JSON adatainkat Turf.js "FeatureCollection" formátummá alakítjuk
        const points = data.map(row => 
            turf.point([row.longitude, row.latitude], { population: row.population })
        );
        const pointsCollection = turf.featureCollection(points);

        // 2. Kiszámoljuk az interpolációs rácsot (Matematikai felület generálása)
        // A cellSize adja meg a rács felbontását (kisebb szám = finomabb gyűrűk, de lassabb számítás)
        const grid = turf.interpolate(pointsCollection, 5, {
            gridType: 'points',
            property: 'population',
            units: 'kilometers',
            weight: 2 // Mennyire vonzza a sűrűség a szomszédos területeket
        });

        // 3. Meghatározzuk a gyűrűk (kategóriák) határértékeit
        // Pl: 0-10e, 10e-30e, 30e-80e, 80e-150e, 150e fölött
        const breaks = [0, 10000, 30000, 80000, 150000, 500000];

        // 4. Létrehozzuk a "gyűrűket" (isobands)
        const isobands = turf.isobands(grid, breaks, { zProperty: 'population' });

        // 5. Színező függvény a kategóriákhoz
        function getColor(value) {
            // A 'value' egy string, pl. "10000-30000"
            const maxVal = parseFloat(value.split('-')[1]);
            return maxVal > 150000 ? '#800026' : // Nagyon sűrű (Sötétvörös)
                   maxVal > 80000  ? '#BD0026' : // Sűrű (Vörös)
                   maxVal > 30000  ? '#FC4E2A' : // Közepes (Narancs)
                   maxVal > 10000  ? '#FD8D3C' : // Ritka (Világos narancs)
                                     '#FFEDA0';  // Nagyon ritka (Halványsárga)
        }

        // 6. Rárajzoljuk a gyűrűket a Leaflet térképre!
        L.geoJSON(isobands, {
            style: function (feature) {
                return {
                    fillColor: getColor(feature.properties.population),
                    weight: 1, // A gyűrűk határolóvonalának vastagsága
                    opacity: 0.8, // A határolóvonal átlátszósága
                    color: 'white', // A határolóvonal színe (fehér háló)
                    fillOpacity: 0.5 // A zóna kitöltésének átlátszósága
                };
            }
        }).addTo(map);

        logEvent("Sűrűségi gyűrűk (Isobands) sikeresen betöltve.");
    })
    .catch(error => {
        console.error("Hiba:", error);
    });




    logEvent(`Loaded postal code data points into heatmap.`);

    // 3. Interactive Drone Base (Facility Location Simulation)
    // Starting coordinates for the drone base (e.g., somewhere in Budapest)
    const baseCoords = [47.4980, 19.0487]; 
    const droneSpeedKmh = 100;
    const maxFlightTimeMinutes = 3;
    const radiusMeters = (droneSpeedKmh / 60) * maxFlightTimeMinutes * 1000; // 5000 meters

    // Create the draggable marker
    const droneMarker = L.marker(baseCoords, {
        draggable: true,
        title: "Drone AED Base"
    }).addTo(map);

    // Create the coverage circle
    const coverageCircle = L.circle(baseCoords, {
        color: 'green',
        fillColor: '#32cd32',
        fillOpacity: 0.3,
        radius: radiusMeters 
    }).addTo(map);

    // Update the circle's position and log the event when the marker is dragged
    droneMarker.on('drag', function(e) {
        const newLatLng = e.latlng;
        coverageCircle.setLatLng(newLatLng);
    });

    droneMarker.on('dragend', function(e) {
        const finalLatLng = e.target.getLatLng();
        logEvent(`Drone base repositioned to Lat: ${finalLatLng.lat.toFixed(4)}, Lng: ${finalLatLng.lng.toFixed(4)}`);
        // Here you could later trigger a function to recalculate how much population is inside the new circle
    });
});