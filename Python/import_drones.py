import pandas as pd
import mysql.connector
from datetime import datetime
import math
import config  # A te config fájlod

def import_mapped_csv_to_db(csv_file_path):
    print(f"'{csv_file_path}' beolvasása és adat-konverzió...")
    try:
        df = pd.read_csv(csv_file_path)
        
        # 1. Csatlakozás az adatbázishoz
        conn = mysql.connector.connect(
            host=config.DB_CONFIG['host'],
            user=config.DB_CONFIG['user'],
            password=config.DB_CONFIG['password'],
            database=config.DB_CONFIG['database']
        )
        cursor = conn.cursor()

        # 2. A cél tábla létrehozása (a te pontos SQL kódod alapján, ha még nem létezne)
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS `drones` (
          `id` int(11) NOT NULL AUTO_INCREMENT,
          `model` varchar(100) NOT NULL,
          `manufacturer` varchar(100) NOT NULL,
          `weight_kg` float NOT NULL,
          `max_speed_kmh` float NOT NULL,
          `payload_weight_kg` float NOT NULL,
          `range_km` float NOT NULL,
          `is_active` tinyint(4) NOT NULL,
          `created_at` datetime NOT NULL,
          `updated_at` datetime NOT NULL,
          PRIMARY KEY (`id`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_hungarian_ci;
        """
        print("Cél tábla ('drones') ellenőrzése...")
        cursor.execute(create_table_sql)

        # Opcionális: Ha ki akarod üríteni a táblát az újratöltés előtt, vedd ki a kommentet az alábbi sorból
        # cursor.execute("TRUNCATE TABLE `drones`;")

        # 3. Adatok leképezése (Mapping) és előkészítése
        data_to_insert = []
        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        for index, row in df.iterrows():
            # Név és Gyártó
            name = str(row['Name']).strip() if pd.notna(row['Name']) else "Unknown"
            manufacturer = name.split(' ')[0] if ' ' in name else name # Az első szó lesz a gyártó
            model = name # A teljes nevet betesszük a modellbe

            # Súly (MTOW) és Payload
            weight_kg = float(row['MTOW [kg]']) if pd.notna(row['MTOW [kg]']) else 0.0
            payload_kg = float(row['Payload [kg]']) if pd.notna(row['Payload [kg]']) else 0.0
            
            # Sebesség konverzió (m/s -> km/h). 
            # Trükk: ha nincs max sebesség, használjuk az utazósebességet
            if pd.notna(row['Max speed [m/s]']):
                speed_ms = float(row['Max speed [m/s]'])
            elif pd.notna(row['Cruise Speed [m/s]']):
                speed_ms = float(row['Cruise Speed [m/s]'])
            else:
                speed_ms = 0.0
                
            max_speed_kmh = round(speed_ms * 3.6, 2)
            
            # Hatótáv
            range_km = float(row['Range [km]']) if pd.notna(row['Range [km]']) else 0.0
            
            # is_active alapértelmezett értéke (1 = aktív)
            is_active = 1 

            # Hozzáadás az insert listához (pontosan a tábla oszlopainak sorrendjében, kivéve az id-t)
            data_to_insert.append((
                model, 
                manufacturer, 
                weight_kg, 
                max_speed_kmh, 
                payload_kg, 
                range_km, 
                is_active, 
                current_time, 
                current_time
            ))

        # 4. Adatok beillesztése a drones táblába
        print(f"Beillesztés folyamatban ({len(data_to_insert)} rekord)...")
        
        insert_sql = """
            INSERT INTO `drones` 
            (model, manufacturer, weight_kg, max_speed_kmh, payload_weight_kg, range_km, is_active, created_at, updated_at) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        cursor.executemany(insert_sql, data_to_insert)
        conn.commit()
        
        print(f"Sikeresen feltöltve {cursor.rowcount} drón adata a 'drones' táblába!")

    except Exception as e:
        print(f"Hiba történt: {e}")
        if 'conn' in locals() and conn.is_connected():
            conn.rollback()
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

# Futtatás
if __name__ == '__main__':
    import_mapped_csv_to_db('../Data/02_Database.csv')