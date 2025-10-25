exports.handler = async (event) => {
    const { zipCode } = event.queryStringParameters;
    const API_KEY = process.env.API_KEY_CENSUS;
    
    const url = `https://api.census.gov/data/2022/acs/acs5?get=B01003_001E,ALAND&for=zip%20code%20tabulation%20area:${zipCode}&key=${API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};