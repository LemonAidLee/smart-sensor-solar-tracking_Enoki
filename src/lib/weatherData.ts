import Papa from 'papaparse';

export interface WeatherDataPoint {
  [key: string]: any;
}

/**
 * Loads the entire dataset into memory. 
 * WARNING: The Kaggle dataset is very large (~300MB). 
 * Use streamWeatherData instead for better performance.
 */
export async function loadWeatherData(): Promise<WeatherDataPoint[]> {
  try {
    const response = await fetch('/data/weather_data.csv');
    if (!response.ok) {
      throw new Error(`Failed to fetch weather data: ${response.statusText}`);
    }
    
    const csvText = await response.text();
    
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          resolve(results.data as WeatherDataPoint[]);
        },
        error: (error: any) => {
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error("Error loading weather data:", error);
    return [];
  }
}

/**
 * Streams the large CSV file row by row without crashing the browser.
 */
export function streamWeatherData(
  onRow: (row: WeatherDataPoint) => void, 
  onComplete?: () => void,
  maxRows?: number
) {
  let count = 0;
  
  Papa.parse('/data/weather_data.csv', {
    download: true,
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    step: (results, parser) => {
      onRow(results.data as WeatherDataPoint);
      count++;
      if (maxRows && count >= maxRows) {
        parser.abort();
        if (onComplete) onComplete();
      }
    },
    complete: () => {
      if (onComplete && count < (maxRows || Infinity)) {
          onComplete();
      }
    },
    error: (error) => {
      console.error("Error streaming weather data:", error);
    }
  });
}
