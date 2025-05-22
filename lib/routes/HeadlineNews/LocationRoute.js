// lib/routes/HeadlineNews/LocationRoute.js
import express from 'express';

const router = express.Router();

// Helper function to fetch IP info from multiple services
const fetchLocationFromServices = async (clientIp = null) => {
  const services = [
    // Service 1: ipapi.co (your original preferred service)
    async () => {
      try {
        const url = clientIp ? `https://ipapi.co/${clientIp}/json/` : 'https://ipapi.co/json/';
        const response = await fetch(url);
        
        if (!response.ok) {
          if (response.status === 429) {
            throw new Error('Rate limited by ipapi.co');
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.reason || 'ipapi.co returned an error');
        }
        
        return {
          ip: data.ip,
          city: data.city,
          region: data.region,
          country: data.country_name,
          countryCode: data.country_code,
          latitude: data.latitude,
          longitude: data.longitude,
          source: 'ipapi.co'
        };
      } catch (err) {
        console.log('ipapi.co failed:', err.message);
        throw err;
      }
    },

    // Service 2: ip-api.com (free, reliable)
    async () => {
      try {
        const url = clientIp 
          ? `http://ip-api.com/json/${clientIp}?fields=status,message,country,countryCode,region,city,lat,lon,query`
          : 'http://ip-api.com/json/?fields=status,message,country,countryCode,region,city,lat,lon,query';
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch from ip-api.com');
        
        const data = await response.json();
        
        if (data.status !== 'success') {
          throw new Error(data.message || 'ip-api.com request failed');
        }
        
        return {
          ip: data.query,
          city: data.city,
          region: data.region,
          country: data.country,
          countryCode: data.countryCode,
          latitude: data.lat,
          longitude: data.lon,
          source: 'ip-api.com'
        };
      } catch (err) {
        console.log('ip-api.com failed:', err.message);
        throw err;
      }
    },

    // Service 3: ipify + ipwho.is (fallback combination)
    async () => {
      try {
        // Get IP first if not provided
        let ip = clientIp;
        if (!ip) {
          const ipResponse = await fetch('https://api.ipify.org?format=json');
          if (!ipResponse.ok) throw new Error('Failed to get IP from ipify');
          const ipData = await ipResponse.json();
          ip = ipData.ip;
        }
        
        const locationResponse = await fetch(`https://ipwho.is/${ip}`);
        if (!locationResponse.ok) throw new Error('Failed to get location from ipwho.is');
        
        const locationData = await locationResponse.json();
        
        if (!locationData.success) {
          throw new Error("Failed to get location data from ipwho.is");
        }
        
        return {
          ip: locationData.ip,
          city: locationData.city,
          region: locationData.region,
          country: locationData.country,
          countryCode: locationData.country_code,
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          source: 'ipify + ipwho.is'
        };
      } catch (err) {
        console.log('ipify + ipwho.is failed:', err.message);
        throw err;
      }
    }
  ];

  // Try each service in order
  for (let i = 0; i < services.length; i++) {
    try {
      console.log(`Trying location service ${i + 1}...`);
      const result = await services[i]();
      console.log(`Location service ${i + 1} (${result.source}) succeeded`);
      return result;
    } catch (err) {
      console.log(`Location service ${i + 1} failed:`, err.message);
      
      // If this is the last service, throw the error
      if (i === services.length - 1) {
        throw new Error(`All location services failed. Last error: ${err.message}`);
      }
      
      // Otherwise, continue to the next service
      continue;
    }
  }
};

// GET endpoint to get location info
router.get('/location', async (req, res) => {
  try {
    console.log('Location request received from IP:', req.ipAddress);
    
    // Get location data using the client's IP
    const locationData = await fetchLocationFromServices(req.ipAddress);
    
    // Add timestamp and request info
    const response = {
      ...locationData,
      requestedAt: new Date().toISOString(),
      requestIp: req.ipAddress
    };
    
    console.log('Location data fetched successfully:', response);
    
    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching location data:', error);
    
    res.status(500).json({
      error: 'Failed to fetch location data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST endpoint for specific IP lookup (optional)
router.post('/location', async (req, res) => {
  try {
    const { ip } = req.body;
    const targetIp = ip || req.ipAddress;
    
    console.log('Location lookup request for IP:', targetIp);
    
    const locationData = await fetchLocationFromServices(targetIp);
    
    const response = {
      ...locationData,
      requestedAt: new Date().toISOString(),
      requestIp: req.ipAddress,
      lookedUpIp: targetIp
    };
    
    console.log('Location lookup completed successfully:', response);
    
    res.status(200).json(response);
  } catch (error) {
    console.error('Error in location lookup:', error);
    
    res.status(500).json({
      error: 'Failed to lookup location data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;