document.addEventListener("DOMContentLoaded", function() {
    
    // 1. Térkép inicializálása
    const map = L.map('map').setView([47.1625, 19.5033], 7);

    // Alaptérkép (CartoDB)
    const baseMapLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=cb1_484l_1_4f3522bc5e5aab9c76aa66b6', {
        maxZoom: 19,
        attribution: '© CARTO'
    }).addTo(map);

    function logEvent(message) {
        const logList = document.getElementById('log_list');
        const newItem = document.createElement('li');
        const time = new Date().toLocaleTimeString();
        newItem.textContent = `[${time}] ${message}`;
        //logList.prepend(newItem);
    }

    logEvent("Térkép inicializálva.");

    // --- RÉTEGCSOPORTOK LÉTREHOZÁSA ---
    const isobandLayerGroup = L.layerGroup().addTo(map); // Alapból bekapcsolva
    const droneBasesLayerGroup = L.layerGroup().addTo(map); // Alapból bekapcsolva
    const postalCodesLayerGroup = L.layerGroup(); // NINCS addTo(map), így alapból rejtve lesz

    // --- RÉTEGVÁLASZTÓ KONTROLL (LAYER CONTROL) ---
    const overlayMaps = {
        "Népsűrűségi Zónák (Isobands)": isobandLayerGroup,
        "Drónhálózat": droneBasesLayerGroup,
        "Irányítószámok": postalCodesLayerGroup
    };
    const layerControl = L.control.layers(null, overlayMaps, { collapsed: false }).addTo(map);


    // 2. NÉPSŰRŰSÉGI ADATOK BETÖLTÉSE (Isobands)
    fetch('Data/heatmap_data.json')
        .then(response => response.json())
        .then(data => {
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


            // --- IRÁNYÍTÓSZÁM PONTOK RAJZOLÁSA ---
            data.forEach(row => {
                // Egy apró, letisztult pötty létrehozása
                const pointMarker = L.circleMarker([row.latitude, row.longitude], {
                    radius: 3,
                    color: '#333333',     // Sötétszürke keret
                    weight: 1,
                    fillColor: '#ffffff', // Fehér belső
                    fillOpacity: 0.9
                });

                // Hover címke (Tooltip) hozzáadása
                pointMarker.bindTooltip(
                    `<div style="text-align:center;">
                        <b>${row.postal_code} - ${row.settlement_name || 'Ismeretlen'}</b><br>
                        Lakosság: ${row.population} fő
                    </div>`,
                    { direction: 'top', offset: [0, -5] }
                );

                // Hozzáadás az új, kikapcsolt rétegcsoporthoz
                pointMarker.addTo(postalCodesLayerGroup);
            });



            // FONTOS: A térkép helyett az isobandLayerGroup-ba tesszük!
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

            logEvent(`Sűrűségi zónák betöltve.`);
        }).catch(error => console.error("Hiba az isoband réteg készítésekor:", error));




    





    // 3. OPTIMALIZÁLT DRÓNBÁZISOK BETÖLTÉSE
    fetch('data/optimized_drone_bases.json')
    .then(response => response.json())
    .then(bases => {
        bases.forEach(base => {
            // 3.1 Vonzáskörzet (Zöld kör) rajzolása. Sugár konvertálása km-ről méterre
            const coverageCircle = L.circle([base.latitude, base.longitude], {
                color: '#32cd32',      // Zöld szegély
                fillColor: '#32cd32',  // Zöld kitöltés
                fillOpacity: 0.15,     // Nagyon halvány, hogy látszódjon alatta a sűrűség
                weight: 1,
                radius: base.covered_radius_km * 1000 
            });

            // 3.2 Maga a bázis (Középpont marker) rajzolása
            const baseMarker = L.circleMarker([base.latitude, base.longitude], {
                radius: 6,
                color: '#8B0000',      // Sötétvörös keret
                fillColor: '#FF0000',  // Piros belső
                fillOpacity: 1,
                weight: 2
            });

            // 3.3 Rákattintásos információs ablak (Popup)
            baseMarker.bindPopup(`
                <div style="font-family:sans-serif;">
                    <h3 style="margin:0 0 5px 0; color:#333;">Bázis (Irányítószám: ${base.center_postal_code})</h3>
                    <b>Hozzárendelt drónok:</b> ${base.assigned_drones} db<br>
                    <b>Napi lefedett esetszám:</b> ${base.covered_daily_cases} db<br>
                    <b>Hatótáv:</b> ${base.covered_radius_km} km
                </div>
            `);

            // Hozzáadás a drón rétegcsoporthoz!
            coverageCircle.addTo(droneBasesLayerGroup);
            baseMarker.addTo(droneBasesLayerGroup);
        });

        logEvent(`Algoritmus betöltve: ${bases.length} drónbázis elhelyezve.`);
    }).catch(error => console.error("Hiba a bázisok betöltésekor:", error));



    // =====================================================================
    // 4. GEOTIFF RÁSZTER BETÖLTÉSE (Ellenőrző réteg)
    // =====================================================================
    
    // Feltételezzük, hogy a fájl a data mappában van
    fetch('../Data/hun_pop_2025_CN_100m_R2025A_v1.tif')
        .then(response => response.arrayBuffer()) // A TIF fájlt bináris adatként kell letölteni
        .then(arrayBuffer => {
            parseGeoraster(arrayBuffer).then(georaster => {
                
                const geoTiffLayer = new GeoRasterLayer({
                    georaster: georaster,
                    opacity: 0.7, // Enyhén átlátszó, hogy alatta a domborzat is látszódjon
                    resolution: 256, // Teljesítményoptimalizálás: mennyi pixelt rendereljen egyszerre
                    
                    // Ez a függvény színezi ki a pixeleket a lakosságszám alapján
                    pixelValuesToColorFn: function(pixelValues) {
                        var population = pixelValues[0];
                        
                        // Ha nincs adat (NoData) vagy 0 ember él ott, legyen teljesen átlátszó
                        if (population === 0 || isNaN(population) || population < 1) {
                            return null;
                        }
                        
                        // Színskála a népsűrűséghez (Pixelenkénti lakosok száma)
                        // A határértékeket (10, 50, 200) a 100x100 méteres rácsra érdemes kalibrálni
                        if (population > 500) return '#800026';  // Extrém sűrű (Sötétvörös)
                        if (population > 100) return '#BD0026';  // Nagyon sűrű (Vörös)
                        if (population > 25)  return '#FC4E2A';  // Közepes (Narancs)
                        if (population > 5)   return '#FD8D3C';  // Ritka (Világos narancs)
                        return '#FFEDA0';                        // Nagyon ritka (Sárga)
                    }
                });

                // Hozzáadjuk a meglévő jobb felső rétegválasztó (Layer Control) menühöz
                layerControl.addOverlay(geoTiffLayer, "Népsűrűség (GeoTIFF (100m))");
                
                logEvent("GeoTIFF raszterréteg sikeresen feldolgozva és a menühöz adva.");
            });
        })
        .catch(error => {
            console.error("Hiba a GeoTIFF betöltésekor. Lehet, hogy nem található a fájl?", error);
        });



});