import pandas as pd
import numpy as np
import math
import matplotlib.pyplot as plt

# 1. Távolságszámító függvény (Haversine)
def calculate_distance(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)
    a = np.sin(dlat / 2)**2 + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) * np.sin(dlon / 2)**2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
    return R * c

def run_batch_simulation():
    print("Adatok betöltése...")
    # JSON beolvasása
    df_original = pd.read_json('../Data/heatmap_data.json')
    
    # Paraméterek
    YEARLY_CASES = 63000
    DAYS_PER_YEAR = 365
    CASES_PER_DAY = YEARLY_CASES / DAYS_PER_YEAR
    MAX_DRONES_PER_STATION = 5
    MAX_FLIGHTS_PER_DRONE_PER_DAY = 4
    STATION_DAILY_CAPACITY = MAX_DRONES_PER_STATION * MAX_FLIGHTS_PER_DRONE_PER_DAY

    # Kereslet elosztása
    total_population = df_original['population'].sum()
    df_original['daily_demand'] = (df_original['population'] / total_population) * CASES_PER_DAY

    results = []
    print("Szimulációk futtatása 1 km-től 100 km-ig. Ez eltarthat 1-2 percig...")
    
    # Iteráció 1-től 100 km-ig
    for current_range in range(1, 101):
        df = df_original.copy()
        df['is_covered'] = False
        
        total_covered_demand = 0.0
        total_needed_stations = 0
        total_assigned_drones = 0
        
        # Mohó algoritmus (95%-os lefedettségig)
        while total_covered_demand < (CASES_PER_DAY * 0.95):
            uncovered_df = df[df['is_covered'] == False]
            if uncovered_df.empty:
                break
                
            best_location = uncovered_df.loc[uncovered_df['daily_demand'].idxmax()]
            base_lat = best_location['latitude']
            base_lon = best_location['longitude']
            
            # Távolságok számítása az új bázistól
            df['dist_to_base'] = df.apply(lambda row: calculate_distance(base_lat, base_lon, row['latitude'], row['longitude']), axis=1)
            
            # Vonzáskörzet
            catchment_area = df[(df['dist_to_base'] <= current_range) & (df['is_covered'] == False)]
            catchment_demand = catchment_area['daily_demand'].sum()
            
            if catchment_demand == 0: break
                
            # Kapacitáskorlátok alkalmazása
            needed_stations = math.ceil(catchment_demand / STATION_DAILY_CAPACITY)
            allocated_drones = math.ceil(catchment_demand / MAX_FLIGHTS_PER_DRONE_PER_DAY)
            
            if allocated_drones > MAX_DRONES_PER_STATION * needed_stations:
                allocated_drones = MAX_DRONES_PER_STATION * needed_stations
                
            # Adminisztráció
            df.loc[catchment_area.index, 'is_covered'] = True
            total_covered_demand += catchment_demand
            
            total_needed_stations += needed_stations
            total_assigned_drones += allocated_drones

        # Végső lefedettség számítása
        coverage_percent = (total_covered_demand / CASES_PER_DAY) * 100
        
        # Progress kiírása a konzolra (hogy lásd, hol tart)
        if current_range % 5 == 0 or current_range == 1:
            print(f"Hatótáv: {current_range} km | Bázisok: {total_needed_stations} db | Drónok: {total_assigned_drones} db | Lefedettség: {coverage_percent:.1f}%")
        
        # Eredmény mentése
        results.append({
            'Range_km': current_range,
            'Bases': total_needed_stations,
            'Drones': total_assigned_drones,
            'Coverage_percent': coverage_percent
        })

    # --- ADATOK MENTÉSE ÉS VIZUALIZÁCIÓ ---
    results_df = pd.DataFrame(results)
    results_df.to_csv('../Data/simulation_results.csv', index=False)
    print("\nEredmények kimentve: ../Data/simulation_results.csv")
    
    # 3. Grafikonok rajzolása
    plt.style.use('seaborn-v0_8-darkgrid')
    fig, axs = plt.subplots(2, 1, figsize=(10, 10))

    # 1. Bázisok száma grafikon
    axs[0].plot(results_df['Range_km'], results_df['Bases'], color='darkred', linewidth=3)
    axs[0].set_title('Szükséges Drónbázisok Száma a Hatótáv Függvényében (95% Lefedettség)', fontsize=14, fontweight='bold')
    axs[0].set_ylabel('Bázisok száma (db)', fontsize=12)
    axs[0].set_xlabel('Drón Hatótávolsága (km)', fontsize=12)
    
    # Kiemelünk egy "Sweet Spotot" (pl. 30 km)
    sweet_spot = results_df[results_df['Range_km'] == 30].iloc[0]
    axs[0].plot(30, sweet_spot['Bases'], marker='o', markersize=8, color='green')
    axs[0].annotate(f"30 km: {int(sweet_spot['Bases'])} bázis", (30, sweet_spot['Bases']), textcoords="offset points", xytext=(15,10), ha='left', fontsize=11, color='green', fontweight='bold')

    # 2. Drónok száma grafikon
    axs[1].plot(results_df['Range_km'], results_df['Drones'], color='navy', linewidth=3)
    axs[1].set_title('Szükséges Drónflotta Mérete a Hatótáv Függvényében', fontsize=14, fontweight='bold')
    axs[1].set_ylabel('Drónok száma (db)', fontsize=12)
    axs[1].set_xlabel('Drón Hatótávolsága (km)', fontsize=12)
    
    axs[1].plot(30, sweet_spot['Drones'], marker='o', markersize=8, color='green')
    axs[1].annotate(f"30 km: {int(sweet_spot['Drones'])} drón", (30, sweet_spot['Drones']), textcoords="offset points", xytext=(15,10), ha='left', fontsize=11, color='green', fontweight='bold')

    plt.tight_layout()
    plt.savefig('../Data/simulation_graphs.png', dpi=300)
    print("Grafikonok elmentve: ../Data/simulation_graphs.png")
    
    # Kép megnyitása
    plt.show()

if __name__ == '__main__':
    run_batch_simulation()