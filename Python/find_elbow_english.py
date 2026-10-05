import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

def find_diminishing_returns():
    # 1. Adatok beolvasása (az előző szkript kimenete)
    try:
        df = pd.read_csv('../Data/simulation_results.csv')
    except FileNotFoundError:
        print("Hiba: Nem található a ../Data/simulation_results.csv fájl.")
        return

    x = df['Range_km'].values
    y = df['Bases'].values

    # 2. Normalizálás (0-1 skálára hozzuk az X és Y tengelyt, hogy a távolságszámítás torzításmentes legyen)
    x_norm = (x - x.min()) / (x.max() - x.min())
    y_norm = (y - y.min()) / (y.max() - y.min())

    # 3. Vonal húzása az első (index 0) és utolsó (index -1) pont között
    p1 = np.array([x_norm[0], y_norm[0]])
    p2 = np.array([x_norm[-1], y_norm[-1]])
    line_vec = p2 - p1

    # 4. Távolságok kiszámítása minden pontra az egyenestől
    distances = []
    for i in range(len(x_norm)):
        p3 = np.array([x_norm[i], y_norm[i]])
        # Keresztszorzattal számoljuk a merőleges távolságot a p1-p2 egyenestől
        distance = np.abs(np.cross(line_vec, p1 - p3)) / np.linalg.norm(line_vec)
        distances.append(distance)

    # 5. A legnagyobb távolság megtalálása (Ez a könyök pont / diminishing return point)
    elbow_idx = np.argmax(distances)
    optimal_range = x[elbow_idx]
    optimal_bases = y[elbow_idx]

    print(f"--- MATEMATIKAI OPTIMUM ---")
    print(f"A csökkenő hozadék pontja (Elbow Point): {optimal_range} km")
    print(f"Szükséges bázisok száma ezen a ponton: {optimal_bases} db")

    # 6. Vizuális reprezentáció poszterre
    plt.style.use('seaborn-v0_8-darkgrid')
    plt.figure(figsize=(10, 6))
    
    # Eredeti görbe
    plt.plot(x, y, color='darkblue', linewidth=3, label='Simulated Base Requirements')
    
    # A könyök pont kiemelése
    plt.scatter(optimal_range, optimal_bases, color='red', s=150, zorder=5, label=f'Optimal Point ({optimal_range} km, {optimal_bases} bases)')
    
    # Formázás
    plt.title('Diminishing Returns Analysis', fontsize=15, fontweight='bold')
    plt.xlabel('Drone Operational Range (km)', fontsize=12)
    plt.ylabel('Required Drone Bases (count)', fontsize=12)
    plt.axvline(x=optimal_range, color='red', linestyle='--', alpha=0.5)
    plt.axhline(y=optimal_bases, color='red', linestyle='--', alpha=0.5)
    plt.legend(fontsize=12)
    plt.tight_layout()
    
    # Mentés és megjelenítés
    plt.savefig('../Data/diminishing_returns_analysis_english.png', dpi=300)
    print("A grafikon elmentve ide: ../Data/diminishing_returns_analysis_english.png")
    plt.show()

if __name__ == '__main__':
    find_diminishing_returns()