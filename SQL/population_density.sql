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