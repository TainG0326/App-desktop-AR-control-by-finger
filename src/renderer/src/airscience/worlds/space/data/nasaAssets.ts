/**
 * NASA Space Asset Manifest
 * 
 * This document tracks all NASA-sourced assets used in AirScience Space World.
 * Every visual asset MUST preserve scientific provenance.
 * 
 * Data sources follow this hierarchy:
 * 1. NASA / JPL scientific datasets
 * 2. NASA mission imagery / planetary mosaics
 * 3. NASA Goddard visualization datasets
 * 4. ESA / other authoritative space agencies
 * 5. USGS Astrogeology or equivalent authoritative planetary mapping
 */

// Earth Assets
export const EARTH_ASSETS = {
  surface: {
    asset: 'earth_surface_8k',
    body: 'earth',
    sourceOrganization: 'NASA',
    dataset: 'Blue Marble Next Generation',
    sourceUrl: 'https://visibleearth.nasa.gov/images/57752/blue-marble-land-ocean-ice-globes-and-swirls',
    sourceResolution: '86400x43200',
    processing: [
      'equirectangular projection',
      'color-space normalized',
      'resized to 8192x4096',
      'WebP encoding'
    ],
    localPath: 'assets/space/earth/earth_surface_8k.webp'
  },
  clouds: {
    asset: 'earth_clouds_8k',
    body: 'earth',
    sourceOrganization: 'NASA',
    dataset: 'Blue Marble Cloud Free Composite',
    sourceUrl: 'https://visibleearth.nasa.gov/images/73249/cloud-free-blue-marble',
    sourceResolution: '43200x21600',
    processing: [
      'cloud layer extracted',
      'equirectangular projection',
      'resized to 8192x4096',
      'WebP encoding'
    ],
    localPath: 'assets/space/earth/earth_clouds_8k.webp'
  },
  nightLights: {
    asset: 'earth_night_4k',
    body: 'earth',
    sourceOrganization: 'NASA',
    dataset: 'Black Marble',
    sourceUrl: 'https://www.nasa.gov/image-gallery/earth-at-night',
    sourceResolution: '32768x16384',
    processing: [
      'city lights extracted',
      'equirectangular projection',
      'resized to 4096x2048',
      'WebP encoding'
    ],
    localPath: 'assets/space/earth/earth_night_4k.webp'
  }
};

// Moon Assets
export const MOON_ASSETS = {
  surface: {
    asset: 'moon_surface_4k',
    body: 'moon',
    sourceOrganization: 'NASA',
    dataset: 'Clementine UVVIS Mosaic',
    sourceUrl: 'https://astrogeology.usgs.gov/search/map/Moon/Clementine/UVVIS/Lunar_Clementine_UVVIS_Global_Mosaic_999m',
    sourceResolution: '17280x8640',
    processing: [
      'equirectangular projection',
      'normalized for 3D rendering',
      'resized to 4096x2048',
      'WebP encoding'
    ],
    localPath: 'assets/space/moon/moon_surface_4k.webp'
  }
};

// Mars Assets
export const MARS_ASSETS = {
  surface: {
    asset: 'mars_surface_4k',
    body: 'mars',
    sourceOrganization: 'NASA',
    dataset: 'Mars Global Surveyor MGS MOC',
    sourceUrl: 'https://mars.nasa.gov/mgs',
    sourceResolution: '14400x7200',
    processing: [
      'equirectangular projection',
      'color calibrated',
      'resized to 4096x2048',
      'WebP encoding'
    ],
    localPath: 'assets/space/mars/mars_surface_4k.webp'
  }
};

// Planet Scientific Data
export const PLANETARY_DATA = {
  sun: {
    id: 'sun',
    nameVi: 'Mặt Trời',
    nameEn: 'Sun',
    meanRadiusKm: 696340,
    massKg: 1.989e30,
    gravity: 274,
    temperature: 5778,
    sourceOrganization: 'NASA',
    sourceUrl: 'https://solarsystem.nasa.gov/solar-system/sun/overview/'
  },
  mercury: {
    id: 'mercury',
    nameVi: 'Sao Thủy',
    nameEn: 'Mercury',
    meanRadiusKm: 2439.7,
    massKg: 3.301e23,
    gravity: 3.7,
    orbitalPeriodDays: 88,
    rotationPeriodHours: 1408,
    sourceOrganization: 'NASA/JPL',
    sourceUrl: 'https://science.nasa.gov/mercury'
  },
  venus: {
    id: 'venus',
    nameVi: 'Sao Kim',
    nameEn: 'Venus',
    meanRadiusKm: 6051.8,
    massKg: 4.867e24,
    gravity: 8.87,
    orbitalPeriodDays: 225,
    rotationPeriodHours: -5832,
    rotationDirection: 'retrograde',
    sourceOrganization: 'NASA/JPL',
    sourceUrl: 'https://science.nasa.gov/venus'
  },
  earth: {
    id: 'earth',
    nameVi: 'Trái Đất',
    nameEn: 'Earth',
    meanRadiusKm: 6371,
    massKg: 5.972e24,
    gravity: 9.81,
    orbitalPeriodDays: 365.25,
    rotationPeriodHours: 24,
    axialTiltDegrees: 23.5,
    atmosphere: 'Nitrogen 78%, Oxygen 21%, Argon 1%',
    sourceOrganization: 'NASA',
    sourceUrl: 'https://science.nasa.gov/earth'
  },
  moon: {
    id: 'moon',
    nameVi: 'Mặt Trăng',
    nameEn: 'Moon',
    meanRadiusKm: 1737.4,
    massKg: 7.342e22,
    gravity: 1.62,
    orbitalPeriodDays: 27.3,
    rotationPeriodHours: 655.7,
    distanceFromEarthKm: 384400,
    sourceOrganization: 'NASA',
    sourceUrl: 'https://science.nasa.gov/moon'
  },
  mars: {
    id: 'mars',
    nameVi: 'Sao Hỏa',
    nameEn: 'Mars',
    meanRadiusKm: 3389.5,
    massKg: 6.417e23,
    gravity: 3.71,
    orbitalPeriodDays: 687,
    rotationPeriodHours: 24.6,
    axialTiltDegrees: 25.2,
    sourceOrganization: 'NASA/JPL',
    sourceUrl: 'https://science.nasa.gov/mars'
  },
  jupiter: {
    id: 'jupiter',
    nameVi: 'Sao Mộc',
    nameEn: 'Jupiter',
    meanRadiusKm: 69911,
    massKg: 1.898e27,
    gravity: 24.79,
    orbitalPeriodDays: 4333,
    rotationPeriodHours: 9.9,
    moons: 95,
    sourceOrganization: 'NASA/JPL',
    sourceUrl: 'https://science.nasa.gov/jupiter'
  },
  saturn: {
    id: 'saturn',
    nameVi: 'Sao Thổ',
    nameEn: 'Saturn',
    meanRadiusKm: 58232,
    massKg: 5.683e26,
    gravity: 10.44,
    orbitalPeriodDays: 10759,
    rotationPeriodHours: 10.7,
    hasRings: true,
    sourceOrganization: 'NASA/JPL',
    sourceUrl: 'https://science.nasa.gov/saturn'
  },
  uranus: {
    id: 'uranus',
    nameVi: 'Sao Thiên Vương',
    nameEn: 'Uranus',
    meanRadiusKm: 25362,
    massKg: 8.681e25,
    gravity: 8.69,
    orbitalPeriodDays: 30687,
    rotationPeriodHours: -17.2,
    rotationDirection: 'retrograde',
    axialTiltDegrees: 97.77,
    sourceOrganization: 'NASA/JPL',
    sourceUrl: 'https://science.nasa.gov/uranus'
  },
  neptune: {
    id: 'neptune',
    nameVi: 'Sao Hải Vương',
    nameEn: 'Neptune',
    meanRadiusKm: 24622,
    massKg: 1.024e26,
    gravity: 11.15,
    orbitalPeriodDays: 60190,
    rotationPeriodHours: 16.1,
    sourceOrganization: 'NASA/JPL',
    sourceUrl: 'https://science.nasa.gov/neptune'
  }
};
