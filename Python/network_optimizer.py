import pandas as pd
import numpy as np
import math

# =====================================================================
# 1. SZIMULÁCIÓS VÁLTOZÓK ÉS PARAMÉTEREK (Itt tudsz tesztelni!)
# =====================================================================

# Keresleti paraméterek
YEARLY_CASES = 63000
DAYS_PER_YEAR = 365
CASES_PER_DAY = YEARLY_CASES / DAYS_PER_YEAR  # ~172.6 eset/nap országosan

# Drónbázis és Flotta paraméterek
MAX_DRONES_PER_STATION = 5
MAX_FLIGHTS_PER_DRONE_PER_DAY = 4  # Tegyük fel, h. 1 drón max 4x repül naponta (töltés/karbantartás miatt)
STATION_DAILY_CAPACITY = MAX_DRONES_PER_STATION * MAX_FLIGHTS_PER_DRONE_PER_DAY  # 20 eset/nap/bázis

# A kiválasztott drón specifikációi (Pl. az AAI Aerosonde vagy a saját VTOL drónod)
DRONE_SPEED_KMH = 147.0 
DRONE_RANGE_KM = 30.0  # Milyen messzire tud elrepülni és visszajönni egy töltéssel

# =====================================================================
# 2. TÁVOLSÁGSZÁMÍTÓ FÜGGVÉNY (Haversine formula)
# =====================================================================
def calculate_distance(lat1, lon1, lat2, lon2):
    R = 6371.0  # Föld sugara km-ben
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)
    a = np.sin(dlat / 2)**2 + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) * np.sin(dlon / 2)**2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
    return R * c

# =====================================================================
# 3. ADATOK BETÖLTÉSE ÉS KERESLET (DEMAND) ELOSZTÁSA
# =====================================================================
print("Adatok betöltése és kereslet normalizálása...")
# Itt betöltjük a korábban létrehozott népsűrűségi (postal codes) adatbázist.
# (Ezt egy adatbázis lekérdezéssel, vagy a JSON fájlod beolvasásával teheted meg)
# Példa kedvéért egy DataFrame-et feltételezünk, amiben benne van: postal_code, latitude, longitude, population
df = pd.read_json('../Data/heatmap_data.json')

# Kiszámoljuk Magyarország teljes lekérdezett lakosságát
total_population = df['population'].sum()

# Elosztjuk a 63,000 esetet a népsűrűség arányában minden irányítószámra
df['yearly_demand'] = (df['population'] / total_population) * YEARLY_CASES
df['daily_demand'] = df['yearly_demand'] / DAYS_PER_YEAR

# Hozzáadunk egy flaget, ami mutatja, hogy az adott területet lefedtük-e már
df['is_covered'] = False

# =====================================================================
# 4. MOHÓ HÁLÓZAT-OPTIMALIZÁLÓ ALGORITMUS (Greedy Set Cover)
# =====================================================================
stations = []
total_covered_demand = 0.0

print(f"Cél: Napi {CASES_PER_DAY:.1f} hirtelen szívmegállás lefedése.")
print(f"Bázis kapacitás: {STATION_DAILY_CAPACITY} eset/nap/bázis.\n")

# Addig futtatjuk, amíg az országos kereslet 95%-át le nem fedjük
while total_covered_demand < (CASES_PER_DAY * 0.95):
    
    # 1. Megkeressük a legnagyobb, MÉG LEFEDETLEN kereslettel rendelkező pontot (Hotspot)
    uncovered_df = df[df['is_covered'] == False]
    if uncovered_df.empty:
        break
        
    best_location = uncovered_df.loc[uncovered_df['daily_demand'].idxmax()]
    base_lat = best_location['latitude']
    base_lon = best_location['longitude']
    
    # 2. Megnézzük, mely települések vannak a drón hatósugarán (pl. 30 km) belül
    df['dist_to_base'] = df.apply(lambda row: calculate_distance(base_lat, base_lon, row['latitude'], row['longitude']), axis=1)
    
    # Kigyűjtjük azokat a helyeket, amiket ez a bázis elér, és még nincsenek lefedve
    catchment_area = df[(df['dist_to_base'] <= DRONE_RANGE_KM) & (df['is_covered'] == False)]
    catchment_demand = catchment_area['daily_demand'].sum()
    
    # 3. Kiszámoljuk, hány bázis (és drón) kell ide a kapacitáskorlát miatt
    # Ha a vonzáskörzet napi 50 esetet generál (pl. Budapesten), és 1 bázis csak 20-at bír, 
    # akkor ide math.ceil(50/20) = 3 db bázist (vagy egy nagy 15 drónos szuperbázist) kell telepíteni.
    needed_stations = math.ceil(catchment_demand / STATION_DAILY_CAPACITY)
    allocated_drones = math.ceil((catchment_demand / MAX_FLIGHTS_PER_DRONE_PER_DAY))
    
    # Maximalizáljuk, hogy egy bázis legfeljebb 5 drónt kaphasson (ha a logika ezt igényli)
    if allocated_drones > MAX_DRONES_PER_STATION * needed_stations:
        allocated_drones = MAX_DRONES_PER_STATION * needed_stations
        
    # 4. Adminisztráljuk a lefedettséget
    df.loc[catchment_area.index, 'is_covered'] = True
    total_covered_demand += catchment_demand
    
    # Eltároljuk az új bázis(ok) adatait
    stations.append({
        'center_postal_code': best_location['postal_code'],
        'latitude': base_lat,
        'longitude': base_lon,
        'covered_radius_km': DRONE_RANGE_KM,
        'covered_daily_cases': round(catchment_demand, 2),
        'needed_stations': needed_stations,
        'assigned_drones': allocated_drones
    })

# =====================================================================
# 5. EREDMÉNYEK ÉS STATISZTIKA
# =====================================================================
stations_df = pd.DataFrame(stations)

print("--- HÁLÓZAT OPTIMALIZÁCIÓ EREDMÉNYE ---")
print(f"Építendő bázisok száma összesen: {stations_df['needed_stations'].sum()} db")
print(f"Szükséges drónflotta mérete: {stations_df['assigned_drones'].sum()} db")
print(f"Lefedett napi esetek: {total_covered_demand:.1f} / {CASES_PER_DAY:.1f} ({(total_covered_demand/CASES_PER_DAY)*100:.1f}%)")

print("\nA legforgalmasabb Top 5 drónbázis-központ:")
print(stations_df[['center_postal_code', 'covered_daily_cases', 'needed_stations', 'assigned_drones']].head(5).to_string(index=False))

# (Opcionális) Kimentheted az eredményt JSON-be a Leaflet térkép számára!
stations_df.to_json('../Data/optimized_drone_bases.json', orient='records')

