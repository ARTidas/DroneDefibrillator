import mysql.connector
import json
import config  # <-- A config.py beimportálása

# 1. Csatlakozás a MariaDB-hez a config.py adatai alapján
try:
    # Feltételezve, hogy a config.py-ban így hívják a változókat:
    # config.DB_HOST, config.DB_USER, config.DB_PASSWORD, config.DB_NAME
    conn = mysql.connector.connect(
        host=config.DB_CONFIG['host'],
        user=config.DB_CONFIG['user'],
        password=config.DB_CONFIG['password'],
        database=config.DB_CONFIG['database']
    )
    
    # PRO TIPP: Ha a config.py-ban egy szótárban (dictionary) tárolod az adatokat, 
    # pl. db_params = {"host": "...", "user": "...", ...}, akkor a fenti 5 sor helyett
    # elég ennyi: conn = mysql.connector.connect(**config.db_params)

    cursor = conn.cursor(dictionary=True)

    # 2. Lekérdezzük a lakossági és koordináta adatokat
    query = """
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
    """
    
    cursor.execute(query)
    rows = cursor.fetchall()

    # 3. A Decimal adattípusokat float-tá kell alakítani, hogy a JSON kezelni tudja
    for row in rows:
        row['latitude'] = float(row['latitude'])
        row['longitude'] = float(row['longitude'])
        row['population'] = int(row['population'])

    # 4. JSON kimentése a data mappába
    with open('../Data/heatmap_data.json', 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False)

    print(f"Sikeres export! {len(rows)} irányítószám adata mentve a heatmap_data.json fájlba.")

except Exception as e:
    print(f"Hiba történt: {e}")
finally:
    if 'conn' in locals() and conn.is_connected():
        cursor.close()
        conn.close()