exports.handler = async (event) => {
    const { address } = event.queryStringParameters;
    const API_KEY = process.env.API_KEY_GOOGLE; // Securely gets key
    
    const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(address)}&inputtype=textquery&fields=place_id,name,geometry,address_components&key=${API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};