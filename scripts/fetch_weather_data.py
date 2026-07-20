import os
import kagglehub
from kagglehub import KaggleDatasetAdapter

def main():
    import shutil
    
    print("Downloading dataset from Kaggle...")
    path = kagglehub.dataset_download("shahmirvarqha/weather-data-malaysia")
    
    source_file = os.path.join(path, "full_weather.csv")
    
    # Ensure public/data directory exists
    output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'data')
    os.makedirs(output_dir, exist_ok=True)
    
    output_file = os.path.join(output_dir, 'weather_data.csv')
    print(f"Copying dataset from {source_file} to {output_file}...")
    
    shutil.copy2(source_file, output_file)
    print("Dataset copied successfully.")

if __name__ == "__main__":
    main()
