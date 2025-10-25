exports.handler = async (event) => {
    const { lat, lng } = event.queryStringParameters;
    const API_KEY = process.env.API_KEY_GOOGLE;
    
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=1609.34&keyword=bitcoin%20atm&key=${API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};