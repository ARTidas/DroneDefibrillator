document.addEventListener("DOMContentLoaded", function() {
    
    // =====================================================================
    // 1. TÉRKÉP ÉS RÉTEGEK INICIALIZÁLÁSA
    // =====================================================================
    const map = L.map('map').setView([47.1625, 19.5033], 7);

    const baseMapLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=cb1_484l_1_4f3522bc5e5aab9c76aa66b6', {
        maxZoom: 19,
        attribution: '© CARTO'
    }).addTo(map);

    function logEvent(message) {
        const logList = document.getElementById('log_list');
        if(logList) {
            const newItem = document.createElement('li');
            const time = new Date().toLocaleTimeString();
            newItem.textContent = `[${time}] ${message}`;
            logList.prepend(newItem);
        }
    }

    logEvent("Térkép inicializálva.");

    const isobandLayerGroup = L.layerGroup().addTo(map); 
    const droneBasesLayerGroup = L.layerGroup().addTo(map); 
    const postalCodesLayerGroup = L.layerGroup(); // Alapból rejtve

    const overlayMaps = {
        "Népsűrűségi Zónák (Isobands)": isobandLayerGroup,
        "Drónhálózat": droneBasesLayerGroup,
        "Irányítószámok": postalCodesLayerGroup
    };
    const layerControl = L.control.layers(null, overlayMaps, { collapsed: false }).addTo(map);

    // --- Szimulációs Globális Változó ---
    let globalPostalData = [];

    // =====================================================================
    // 2. NÉPSŰRŰSÉGI ADATOK BETÖLTÉSE (Isobands & Irányítószámok)
    // =====================================================================
    fetch('data/heatmap_data.json')
        .then(response => response.json())
        .then(data => {
            // Eltesszük az adatokat az interaktív szimulátornak
            globalPostalData = data; 

            // --- A) ISOBAND GENERÁLÁS (Turf.js) ---
            const hungaryBbox = [16.0, 45.7, 23.0, 48.6]; 
            const points = data.map(row => 
                turf.point([row.longitude, row.latitude], { density: row.density_category_id })
            );
            const pointsCollection = turf.featureCollection(points);

            const grid = turf.interpolate(pointsCollection, 5, {
                gridType: 'points', property: 'density', units: 'kilometers', weight: 2, bbox: hungaryBbox 
            });

            const breaks = [0, 1.5, 2.5, 3.5, 4.5, 6];
            const isobands = turf.isobands(grid, breaks, { zProperty: 'density' });

            function getColor(value) {
                if (value === "4.5-6") return '#800026';
                if (value === "3.5-4.5") return '#BD0026';
                if (value === "2.5-3.5") return '#FC4E2A';
                if (value === "1.5-2.5") return '#FD8D3C';
                return '#FFEDA0'; 
            }

            if (typeof hungaryBoundary !== 'undefined') {
                let maskPolygon = hungaryBoundary.type === "FeatureCollection" ? hungaryBoundary.features[0] : hungaryBoundary;
                let clippedFeatures = [];
                turf.featureEach(isobands, function (currentIsoband) {
                    try {
                        let clipped = turf.intersect(currentIsoband, maskPolygon);
                        if (clipped) {
                            clipped.properties = currentIsoband.properties;
                            clippedFeatures.push(clipped);
                        }
                    } catch (e) { console.warn("Vágási hiba", e); }
                });
                isobands.features = clippedFeatures;
            }

            L.geoJSON(isobands, {
                style: function (feature) {
                    return {
                        fillColor: getColor(feature.properties.density),
                        weight: 1, opacity: 0.8, color: 'white', fillOpacity: 0.6 
                    };
                }
            }).addTo(isobandLayerGroup);

            if (typeof hungaryBoundary !== 'undefined') {
                L.geoJSON(hungaryBoundary, {
                    style: { color: '#333333', weight: 2, fillOpacity: 0 }
                }).addTo(isobandLayerGroup);
            }

            // --- B) IRÁNYÍTÓSZÁM PONTOK RAJZOLÁSA ---
            data.forEach(row => {
                const pointMarker = L.circleMarker([row.latitude, row.longitude], {
                    radius: 3, color: '#333333', weight: 1, fillColor: '#ffffff', fillOpacity: 0.9
                });

                pointMarker.bindTooltip(
                    `<div style="text-align:center;">
                        <b>${row.postal_code} - ${row.settlement_name || 'Ismeretlen'}</b><br>
                        Lakosság: ${row.population} fő
                    </div>`,
                    { direction: 'top', offset: [0, -5] }
                );
                pointMarker.addTo(postalCodesLayerGroup);
            });

            logEvent(`Sűrűségi zónák betöltve.`);

            // C) SZIMULÁCIÓ INDÍTÁSA AUTOMATIKUSAN ALAPÉRTÉKEKKEL
            runOptimization();

        }).catch(error => console.error("Hiba az adatok betöltésekor:", error));

    // =====================================================================
    // 3. GEOTIFF RÁSZTER BETÖLTÉSE (Ellenőrző réteg)
    // =====================================================================
    fetch('../Data/hun_pop_2025_CN_100m_R2025A_v1.tif')
        .then(response => response.arrayBuffer()) 
        .then(arrayBuffer => {
            parseGeoraster(arrayBuffer).then(georaster => {
                const geoTiffLayer = new GeoRasterLayer({
                    georaster: georaster,
                    opacity: 0.7, 
                    resolution: 256, 
                    pixelValuesToColorFn: function(pixelValues) {
                        var population = pixelValues[0];
                        if (population === 0 || isNaN(population) || population < 1) return null;
                        
                        if (population > 500) return '#800026';  
                        if (population > 100) return '#BD0026';  
                        if (population > 25)  return '#FC4E2A';  
                        if (population > 5)   return '#FD8D3C';  
                        return '#FFEDA0';                        
                    }
                });

                layerControl.addOverlay(geoTiffLayer, "Népsűrűség (GeoTIFF (100m))");
                logEvent("GeoTIFF raszterréteg feldolgozva.");
            });
        })
        .catch(error => console.error("Hiba a GeoTIFF betöltésekor.", error));

    // =====================================================================
    // 4. ÉLŐ, INTERAKTÍV HÁLÓZAT OPTIMALIZÁLÓ (JS Algoritmus)
    // =====================================================================
    
    // UI események (Csúszkák és gomb)
    if(document.getElementById('range_slider')) {
        document.getElementById('range_slider').addEventListener('input', e => document.getElementById('range_val').innerText = e.target.value);
        document.getElementById('drone_slider').addEventListener('input', e => document.getElementById('drone_val').innerText = e.target.value);
        document.getElementById('flight_slider').addEventListener('input', e => document.getElementById('flight_val').innerText = e.target.value);
        document.getElementById('run_sim_btn').addEventListener('click', runOptimization);
    }

    // Távolságkalkulátor (Haversine formula)
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371.0;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    // Fő szimulációs motor
    function runOptimization() {
        if (!globalPostalData || globalPostalData.length === 0) return;

        // Paraméterek beolvasása a HTML-ből (vagy alapértékek, ha a HTML nem töltött be)
        const rangeKm = document.getElementById('range_slider') ? parseFloat(document.getElementById('range_slider').value) : 30;
        const dronesPerBase = document.getElementById('drone_slider') ? parseInt(document.getElementById('drone_slider').value) : 5;
        const flightsPerDrone = document.getElementById('flight_slider') ? parseInt(document.getElementById('flight_slider').value) : 4;
        
        const YEARLY_CASES = 63000;
        const CASES_PER_DAY = YEARLY_CASES / 365;
        const STATION_DAILY_CAPACITY = dronesPerBase * flightsPerDrone;

        let totalPop = globalPostalData.reduce((sum, row) => sum + row.population, 0);

        let demandData = globalPostalData.map(row => ({
            latitude: row.latitude,
            longitude: row.longitude,
            postal_code: row.postal_code,
            daily_demand: ((row.population / totalPop) * YEARLY_CASES) / 365,
            is_covered: false
        }));

        let stations = [];
        let totalCoveredDemand = 0.0;

        // Mohó Algoritmus Ciklus (95% lefedettségig)
        while(totalCoveredDemand < CASES_PER_DAY * 0.95) {
            
            let maxIndex = -1;
            let maxVal = -1;
            for (let i = 0; i < demandData.length; i++) {
                if (!demandData[i].is_covered && demandData[i].daily_demand > maxVal) {
                    maxVal = demandData[i].daily_demand;
                    maxIndex = i;
                }
            }
            if (maxIndex === -1) break; 

            let bestLoc = demandData[maxIndex];
            let catchmentDemand = 0;
            let catchmentIndices = [];
            
            for (let i = 0; i < demandData.length; i++) {
                if (!demandData[i].is_covered) {
                    let d = calculateDistance(bestLoc.latitude, bestLoc.longitude, demandData[i].latitude, demandData[i].longitude);
                    if (d <= rangeKm) {
                        catchmentDemand += demandData[i].daily_demand;
                        catchmentIndices.push(i);
                    }
                }
            }

            let neededStations = Math.ceil(catchmentDemand / STATION_DAILY_CAPACITY);
            let allocatedDrones = Math.ceil(catchmentDemand / flightsPerDrone);
            
            if (allocatedDrones > dronesPerBase * neededStations) {
                allocatedDrones = dronesPerBase * neededStations;
            }

            catchmentIndices.forEach(idx => demandData[idx].is_covered = true);
            totalCoveredDemand += catchmentDemand;

            stations.push({
                latitude: bestLoc.latitude,
                longitude: bestLoc.longitude,
                postal_code: bestLoc.postal_code,
                radius: rangeKm,
                covered_demand: catchmentDemand,
                needed_stations: neededStations,
                assigned_drones: allocatedDrones
            });
        }

        // TÉRKÉP FRISSÍTÉSE (Korábbi bázisok törlése és újak rajzolása)
        droneBasesLayerGroup.clearLayers();
        
        let totalNeededStations = 0;
        let totalAssignedDrones = 0;

        stations.forEach(base => {
            totalNeededStations += base.needed_stations;
            totalAssignedDrones += base.assigned_drones;

            const coverageCircle = L.circle([base.latitude, base.longitude], {
                color: '#32cd32', fillColor: '#32cd32', fillOpacity: 0.15, weight: 1,
                radius: base.radius * 1000 
            });

            const baseMarker = L.circleMarker([base.latitude, base.longitude], {
                radius: 6, color: '#8B0000', fillColor: '#FF0000', fillOpacity: 1, weight: 2
            });

            baseMarker.bindPopup(`
                <div style="font-family:sans-serif;">
                    <h3 style="margin:0 0 5px 0; color:#333;">Bázis (Irányítószám: ${base.postal_code})</h3>
                    <b>Hozzárendelt drónok:</b> ${base.assigned_drones} db<br>
                    <b>Napi lefedett eset:</b> ${base.covered_demand.toFixed(2)} db<br>
                    <b>Hatótáv:</b> ${base.radius} km
                </div>
            `);

            coverageCircle.addTo(droneBasesLayerGroup);
            baseMarker.addTo(droneBasesLayerGroup);
        });

        // Eredmények kiírása a vezérlőpanelre
        if(document.getElementById('res_bases')) {
            const coveragePercent = ((totalCoveredDemand / CASES_PER_DAY) * 100).toFixed(1);
            document.getElementById('res_bases').innerText = totalNeededStations;
            document.getElementById('res_drones').innerText = totalAssignedDrones;
            document.getElementById('res_coverage').innerText = coveragePercent;
        }
        
        logEvent(`Szimuláció lefutott: Hatótáv=${rangeKm}km. Bázisok=${totalNeededStations}db.`);
    }

});