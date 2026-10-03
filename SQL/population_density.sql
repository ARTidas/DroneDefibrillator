SELECT 
    postal_code,
    category,
    settlement_name,
    county,
    district,
    settlement_type,
    population,
    settlement_total_pop,
    latitude,
    longitude,
    updated_at,
    -- Ez a varázslat: 5 egyenlő csoportra osztja az adatokat a lakosság alapján (növekvő sorrendben)
    NTILE(5) OVER (ORDER BY population ASC) AS density_category_id,
    
    -- Egy olvasható szöveges címkét is rakunk hozzá a frontend számára
    CASE NTILE(5) OVER (ORDER BY population ASC)
        WHEN 1 THEN '1 - Nagyon ritka'
        WHEN 2 THEN '2 - Ritka'
        WHEN 3 THEN '3 - Közepes'
        WHEN 4 THEN '4 - Sűrű'
        WHEN 5 THEN '5 - Nagyon sűrű'
    END AS density_label
    
FROM 
    `02773_research`.`geo_hungary_postal_codes_aggregated`
WHERE 
    population > 0 -- Csak a lakott helyeket vesszük figyelembe
ORDER BY 
    population DESC
;


SELECT 
    -- A MIN/MAX azért kell, hogy szöveges adatokat is kinyerjünk (pl. település neve) a csoportosítás után
    MAX(postal_code) AS postal_code, 
    MAX(settlement_name) AS settlement_name,
    MAX(county) AS county,
    latitude, 
    longitude, 
    SUM(population) AS population,
    
    -- Itt az NTILE() ablakfüggvényt a SUM(population) eredményére hívjuk meg!
    NTILE(5) OVER (ORDER BY SUM(population) ASC) AS density_category_id,
    
    CASE NTILE(5) OVER (ORDER BY SUM(population) ASC)
        WHEN 1 THEN '1 - Nagyon ritka'
        WHEN 2 THEN '2 - Ritka'
        WHEN 3 THEN '3 - Közepes'
        WHEN 4 THEN '4 - Sűrű'
        WHEN 5 THEN '5 - Nagyon sűrű'
    END AS density_label
    
FROM 
    `02773_research`.`geo_hungary_postal_codes_aggregated`
WHERE 
    population > 0 
    AND latitude IS NOT NULL 
    AND longitude IS NOT NULL
GROUP BY 
    latitude, 
    longitude
ORDER BY 
    population DESC;



SELECT 
    d.manufacturer,
    d.model,
    d.payload_weight_kg,
    d.max_speed_kmh,
    d.range_km,
    d.weight_kg AS mtow_kg,
    
    -- A pontozási algoritmus (AED Score)
    (
        0.50 * (d.max_speed_kmh / m.max_speed) +             -- 50% Sebesség
        0.20 * (d.range_km / m.max_range) +                  -- 20% Hatótáv
        0.20 * (1.0 - (d.weight_kg / m.max_weight)) +        -- 20% Súly (inverz: a könnyebb a jobb)
        0.10 * (d.payload_weight_kg / m.max_payload)         -- 10% Hasznos teher
    ) AS aed_score

FROM 
    `drones` d
    
-- Allekérdezés a normalizáláshoz: megkeressük a kategória (szűrt mezőny) maximumait
CROSS JOIN (
    SELECT 
        MAX(max_speed_kmh) AS max_speed,
        MAX(range_km) AS max_range,
        MAX(weight_kg) AS max_weight,
        MAX(payload_weight_kg) AS max_payload
    FROM 
        `drones`
    WHERE 
        payload_weight_kg >= 2.0 
        AND max_speed_kmh > 0 
        AND range_km >= 10 
        AND weight_kg <= 55
        AND is_active = 1
) m

-- Ugyanazok a kizáró feltételek (Hard Constraints) magára a listára
WHERE 
    d.payload_weight_kg >= 2.0 
    AND d.max_speed_kmh > 0 
    AND d.range_km >= 10 
    AND d.weight_kg <= 55
    AND d.is_active = 1

ORDER BY 
    aed_score DESC
LIMIT 5;



