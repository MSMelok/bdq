/*
================================================================
LOCAL-ONLY API KEYS
================================================================
*/
const API_KEY_GOOGLE = "AIzaSyApCw7BD3IhGJYt8zMLzMX9uiY37VppcH0"; // Your Google API Key
const API_KEY_CENSUS = "535b5511899e2256fe179966adc31e2591c6aea2"; // Your Census API Key

// --- Global Variables ---
let autocomplete;
let autocompletePlace = null; // Will store the selected place
let lastZipLeads = []; // Will store the last ZIP Scout results for export

// --- Business Logic Definitions ---

// NEW: Refined Corporate Blocklist
const CORPORATE_CHAIN_BLOCKLIST = [
    // Big Box / Pharmacy
    'walmart', 'target', 'cvs', 'walgreens', 'rite aid', 'costco', 'sam\'s club',
    
    // National C-Stores
    '7-eleven', '7 eleven', 'circle k', 'casey\'s general store',
    
    // Super-Regional C-Stores
    'wawa', 'sheetz', 'quiktrip', 'kum & go', 'royal farms', 'mapco',
    
    // National Gas Brands (they have exclusive C-store deals)
    'bp', 'shell', 'exxon', 'mobil', 'chevron', 'texaco', 'sunoco', 'marathon', 'citgo',
    
    // Travel Plazas
    'pilot', 'flying j', "love's travel stop",
    
    // Grocery Chains
    'kroger', 'albertsons', 'safeway', 'publix', 'food lion', 'meijer', 
    'stop & shop', 'giant', 'heb', 'winn-dixie',
    
    // Dollar Stores
    'dollar general', 'family dollar', 'dollar tree'
];

const TIER_1_TYPES = [
    'supermarket', 'grocery_or_supermarket', 'convenience_store'
];

const TIER_2_TYPES = [
    'liquor_store', 'hardware_store', 'laundromat', 'restaurant', 'cafe',
    'meal_takeaway', 'pawn_shop', 'pharmacy', 'shoe_store', 'shopping_mall',
    'jewelry_store', 'car_repair', 'auto_parts_store', 'sporting_goods_store',
    'bowling_alley', 'casino', 'bank', 'store', 'lodging', 'clothing_store',
    'thrift_store', 'bar'
];

const COMPETITOR_KEYWORDS = [
    'coinflip', 'coin cloud', 'rockitcoin', 'coinstar', 
    'bitstop', 'athena', 'libertyx', 'bytefederal', 'get bitcoin'
];

// --- DOM Element References ---
const addressInput = document.getElementById('address-input');
const qualifyBtn = document.getElementById('qualify-btn');
const resultsContainer = document.getElementById('results-container');
const minPopDensityInput = document.getElementById('min-pop-density');
const resultBusinessName = document.getElementById('result-business-name');

// NEW: Final Status Container
const finalStatusContainer = document.getElementById('final-status-container');
const finalStatusIcon = document.getElementById('final-status-icon');
const finalStatusText = document.getElementById('final-status-text');

// Result Card References
const step1Card = document.getElementById('step-1-geocode');
const step2Card = document.getElementById('step-2-population');
const step3Card = document.getElementById('step-3-btms');
const step4Card = document.getElementById('step-4-biz-type');
const step5Card = document.getElementById('step-5-hours');

// Result Text References
const geocodeResult = document.getElementById('geocode-result');
const populationResult = document.getElementById('population-result');
const btmResult = document.getElementById('btm-result');
const bizTypeResult = document.getElementById('biz-type-result');
const hoursResult = document.getElementById('hours-result');
const competitorIntel = document.getElementById('competitor-intel');

// ZIP Scout References
const zipScoutInput = document.getElementById('zip-scout-input');
const zipScoutBtn = document.getElementById('zip-scout-btn');
const zipScoutResults = document.getElementById('zip-scout-results');

// NEW: Hidden Tool Toggle & Export References
const copyrightToggle = document.getElementById('copyright-toggle');
const zipScoutTool = document.querySelector('.zip-scout');
const exportControls = document.getElementById('export-controls');
const exportCsvBtn = document.getElementById('export-csv-btn');
const exportJsonBtn = document.getElementById('export-json-btn');

// --- NEW AUTOCOMPLETE INITIALIZATION ---
function initAutocomplete() {
    autocomplete = new google.maps.places.Autocomplete(addressInput, {
        fields: ['place_id', 'name', 'geometry', 'address_components']
    });
    autocomplete.addListener('place_changed', () => {
        autocompletePlace = autocomplete.getPlace();
    });
}

// --- Event Listeners ---
qualifyBtn.addEventListener('click', qualifyAddress);
zipScoutBtn.addEventListener('click', findLeadsInZip);

// NEW: Listeners for Toggle and Export
copyrightToggle.addEventListener('click', () => {
    zipScoutTool.classList.toggle('hidden');
});
exportCsvBtn.addEventListener('click', exportAsCSV);
exportJsonBtn.addEventListener('click', exportAsJSON);


// --- Main Application Flow (UPDATED) ---
async function qualifyAddress() {
    const address = addressInput.value;
    if (!address && !autocompletePlace) {
        alert("Please enter an address or select one from the list.");
        return;
    }

    resetUI(); // Resets the UI, including hiding final status
    
    // NEW: Set button to loading state
    qualifyBtn.disabled = true;
    qualifyBtn.innerHTML = '<span class="loader-small"></span> Qualifying...';
    
    let isQualified = true;
    let geoData = {}; 

    try {
        // --- Step 1: Geocode Address (Smart Logic) ---
        updateStepUI(step1Card, 'pending', 'Finding location...');
        if (autocompletePlace && autocompletePlace.place_id) {
            console.log("Using Autocomplete data (Fast Path)");
            const zipComponent = autocompletePlace.address_components.find(c => c.types.includes('postal_code'));
            geoData = {
                lat: autocompletePlace.geometry.location.lat(),
                lng: autocompletePlace.geometry.location.lng(),
                placeId: autocompletePlace.place_id,
                zipCode: zipComponent ? zipComponent.short_name : null,
                businessName: autocompletePlace.name
            };
            autocompletePlace = null; 
        } else {
            console.log("Using findPlace API (Fallback Path)");
            geoData = await findPlace(address);
        }
        
        if (!geoData.zipCode) {
            updateStepUI(step1Card, 'fail', `Could not find a valid ZIP code.`);
            throw new Error("Geocoding failed to find ZIP.");
        }
        
        resultsContainer.classList.remove('hidden'); // Show results cards
        updateStepUI(step1Card, 'success', `ZIP: ${geoData.zipCode}<br>Found: ${geoData.businessName}`);
        resultBusinessName.textContent = geoData.businessName;

        // --- Step 2: Check Population Density ---
        updateStepUI(step2Card, 'pending', 'Fetching population...');
        const { density } = await checkPopulation(geoData.zipCode);
        const minDensity = parseInt(minPopDensityInput.value, 10);
        
        if (density >= minDensity) {
            updateStepUI(step2Card, 'success', `Density: ${density.toLocaleString()}/sq mi`);
        } else {
            isQualified = false;
            updateStepUI(step2Card, 'fail', `Density: ${density.toLocaleString()}/sq mi (Min: ${minDensity})`);
        }

        // --- Step 3: Check Nearby BTMs ---
        updateStepUI(step3Card, 'pending', 'Scanning for BTMs...');
        const { bdCount, competitorCounts } = await checkNearbyBTMs(geoData.lat, geoData.lng);
        
        let competitorText = "None found.";
        if (Object.keys(competitorCounts).length > 0) {
            competitorText = Object.entries(competitorCounts)
                .map(([name, count]) => `<strong>${name}</strong>: ${count}`)
                .join(', ');
        }
        competitorIntel.innerHTML = competitorText;

        if (bdCount > 0) {
            isQualified = false;
            updateStepUI(step3Card, 'fail', `Found ${bdCount} BD BTM(s) nearby.`);
        } else {
            const totalCompetitors = Object.values(competitorCounts).reduce((a, b) => a + b, 0);
            updateStepUI(step3Card, 'success', `BD BTMs: 0<br>Competitors: ${totalCompetitors}`);
        }

        // --- Steps 4 & 5: Business Type & Store Hours (Combined API Call) ---
        updateStepUI(step4Card, 'pending', 'Checking business type...');
        updateStepUI(step5Card, 'pending', 'Checking store hours...');
        
        const placeDetails = await getPlaceDetails(geoData.placeId);

        // --- Step 4 Logic ---
        const { tier, businessType, isCorporate } = checkBusinessType(placeDetails.types, geoData.businessName);
        
        if (isCorporate) {
            isQualified = false;
            updateStepUI(step4Card, 'fail', businessType);
        } else if (tier === 'N/A') {
            isQualified = false;
            updateStepUI(step4Card, 'fail', `Invalid Type: ${businessType}`);
        } else {
            updateStepUI(step4Card, 'success', `Tier ${tier} (${businessType})`);
        }

        // --- Step 5 Logic ---
        const { meetsHours, hoursText } = checkStoreHours(placeDetails.opening_hours);
        if (meetsHours === 'fail') {
            isQualified = false;
            updateStepUI(step5Card, 'fail', hoursText);
        } else if (meetsHours === 'warn') {
            updateStepUI(step5Card, 'warn', hoursText);
        } else {
            updateStepUI(step5Card, 'success', hoursText);
        }

        // --- Final Qualification ---
        showFinalStatus(isQualified, isQualified ? 'QUALIFIED FOR PLACEMENT' : 'NOT QUALIFIED');

    } catch (error) {
        console.error("Qualification failed:", error);
        showFinalStatus(false, 'ERROR');
        alert(`An error occurred: ${error.message}\n\nCheck the console (F12) for details.`);
    } finally {
        // NEW: Reset button state
        qualifyBtn.disabled = false;
        qualifyBtn.innerHTML = 'Qualify';
        autocompletePlace = null; // Clear selected place
    }
}

// --- API Helper Functions (Unchanged) ---
// (findPlace, checkPopulation, checkNearbyBTMs, getPlaceDetails)
async function findPlace(address) {
    const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(address)}&inputtype=textquery&fields=place_id,name,geometry,address_components&key=${API_KEY_GOOGLE}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) { throw new Error("Address not found by Google."); }
    const candidate = data.candidates[0];
    const zipComponent = candidate.address_components.find(c => c.types.includes('postal_code'));
    return {
        lat: candidate.geometry.location.lat,
        lng: candidate.geometry.location.lng,
        placeId: candidate.place_id,
        zipCode: zipComponent ? zipComponent.short_name : null,
        businessName: candidate.name
    };
}
async function checkPopulation(zipCode) {
    const url = `https://api.census.gov/data/2022/acs/acs5?get=B01003_001E,ALAND&for=zip%20code%20tabulation%20area:${zipCode}&key=${API_KEY_CENSUS}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!data || data.length < 2) { throw new Error(`No population data for ZIP: ${zipCode}`); }
    const population = parseFloat(data[1][0]);
    const landAreaMeters = parseFloat(data[1][1]);
    if (landAreaMeters === 0) { return { density: 0 }; }
    const landAreaMiles = landAreaMeters / 2589988.11;
    const density = Math.round(population / landAreaMiles);
    return { density };
}
async function checkNearbyBTMs(lat, lng) {
    const radiusMeters = 1609.34; // 1 mile
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&keyword=bitcoin%20atm&key=${API_KEY_GOOGLE}`;
    const response = await fetch(url);
    const data = await response.json();
    let bdCount = 0;
    let competitorCounts = {};
    for (const result of data.results) {
        const name = result.name.toLowerCase();
        if (name.includes('bitcoin depot')) {
            bdCount++;
            continue;
        }
        let foundCompetitor = false;
        for (const comp of COMPETITOR_KEYWORDS) {
            if (name.includes(comp)) {
                competitorCounts[comp] = (competitorCounts[comp] || 0) + 1;
                foundCompetitor = true;
                break;
            }
        }
        if (!foundCompetitor) { console.log("Found unknown BTM:", name); }
    }
    return { bdCount, competitorCounts };
}
async function getPlaceDetails(placeId) {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,types,opening_hours&key=${API_KEY_GOOGLE}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!data.result) { throw new Error("Could not get Place Details."); }
    return data.result;
}
// --- Logic Helper Functions (checkBusinessType is updated) ---
function checkBusinessType(types, businessName) {
    const lowerCaseName = businessName.toLowerCase();
    
    // 1. Check against refined blocklist
    for (const chain of CORPORATE_CHAIN_BLOCKLIST) {
        if (lowerCaseName.includes(chain)) {
            return { 
                tier: 'N/A', 
                businessType: `Corporate: ${businessName}`, 
                isCorporate: true 
            };
        }
    }
    // 2. If not corporate, proceed with tier check
    if (!types || types.length === 0) {
        return { tier: 'N/A', businessType: 'Unknown', isCorporate: false };
    }
    for (const type of types) {
        if (TIER_1_TYPES.includes(type)) {
            return { tier: 1, businessType: type.replace(/_/g, ' '), isCorporate: false };
        }
    }
    for (const type of types) {
        if (TIER_2_TYPES.includes(type)) {
            return { tier: 2, businessType: type.replace(/_/g, ' '), isCorporate: false };
        }
    }
    return { tier: 'N/A', businessType: types[0].replace(/_/g, ' '), isCorporate: false };
}
function checkStoreHours(opening_hours) {
    if (!opening_hours || !opening_hours.periods) {
        return { meetsHours: 'warn', hoursText: 'Hours not available. Manual check required.' };
    }
    if (opening_hours.periods.length === 1 && opening_hours.periods[0].open.day === 0 && !opening_hours.periods[0].close) {
        return { meetsHours: 'success', hoursText: 'Open 24/7' };
    }
    const dailyMinutes = new Array(7).fill(0);
    for (const period of opening_hours.periods) {
        if (period.open.time === '0000' && !period.close) {
            dailyMinutes[period.open.day] = 24 * 60; continue;
        }
        const openTime = parseInt(period.open.time, 10);
        const closeTime = parseInt(period.close.time, 10);
        const openMins = (Math.floor(openTime / 100) * 60) + (openTime % 100);
        const closeMins = (Math.floor(closeTime / 100) * 60) + (closeTime % 100);
        let duration = closeMins - openMins;
        if (duration < 0) { duration += 24 * 60; }
        dailyMinutes[period.open.day] += duration;
    }
    let openDays = 0, longEnoughDays = 0;
    const minHours = 9 * 60; // 9 hours
    for (const mins of dailyMinutes) {
        if (mins > 0) openDays++;
        if (mins >= minHours) longEnoughDays++;
    }
    if (openDays < 5) {
        return { meetsHours: 'fail', hoursText: `Fails: Open only ${openDays} days/week.` };
    }
    if (longEnoughDays < 5) {
        return { meetsHours: 'fail', hoursText: `Fails: Only ${longEnoughDays} days meet 9hr min.` };
    }
    return { meetsHours: 'success', hoursText: `Open ${openDays} days/week (${longEnoughDays} meet 9hr min).` };
}

// --- UI Helper Functions (Updated) ---

/**
 * Resets the UI to its initial state before a new query.
 */
function resetUI() {
    resultsContainer.classList.add('hidden');
    finalStatusContainer.classList.add('hidden');
    
    resultBusinessName.textContent = '';
    competitorIntel.textContent = '';

    // Reset button
    qualifyBtn.disabled = false;
    qualifyBtn.innerHTML = 'Qualify';

    const cards = document.querySelectorAll('.result-card');
    cards.forEach(card => {
        const icon = card.querySelector('.status-icon');
        const text = card.querySelector('p');
        icon.className = 'status-icon pending';
        text.innerHTML = '';
    });
}

/**
 * NEW: Shows the big final status box
 */
function showFinalStatus(isQualified, text) {
    finalStatusContainer.classList.remove('hidden');
    if (isQualified) {
        finalStatusContainer.className = 'qualified';
        finalStatusIcon.textContent = '✅';
        finalStatusText.textContent = text;
    } else {
        finalStatusContainer.className = 'not-qualified';
        finalStatusIcon.textContent = '❌';
        finalStatusText.textContent = text;
    }
}

/**
 * Updates a single step's card with status and message.
 */
function updateStepUI(cardElement, status, message) {
    const icon = cardElement.querySelector('.status-icon');
    const text = cardElement.querySelector('p');
    icon.className = 'status-icon'; // Clear existing status
    if (status !== 'pending') {
        icon.classList.add(status);
    }
    text.innerHTML = message;
}

// --- Hidden Tool: ZIP Scout (Functions Updated) ---

async function geocodeZip(zipCode) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(zipCode)}&key=${API_KEY_GOOGLE}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!data.results || data.results.length === 0) { throw new Error("ZIP code not found."); }
    return data.results[0].geometry.location; // { lat, lng }
}

async function findBusinesses(lat, lng, radius, type) {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${API_KEY_GOOGLE}`;
    const response = await fetch(url);
    const data = await response.json();
    return data.results;
}

async function findLeadsInZip() {
    const zipCode = zipScoutInput.value;
    if (!zipCode) { alert("Please enter a ZIP code."); return; }

    zipScoutResults.innerHTML = `<div class="loader"></div><p>Searching ZIP: ${zipCode}... (This may take a minute)</p>`;
    exportControls.classList.add('hidden'); // Hide export buttons on new search
    lastZipLeads = []; // Clear last results

    try {
        const { lat, lng } = await geocodeZip(zipCode);
        const searchRadius = 5000; // ~3 miles
        const typesToSearch = [
            'supermarket', 'convenience_store', 'liquor_store', 
            'laundromat', 'restaurant', 'pawn_shop', 'pharmacy'
        ];
        const searchPromises = typesToSearch.map(type => findBusinesses(lat, lng, searchRadius, type));
        const resultsByTpe = await Promise.all(searchPromises);
        
        const uniqueLeads = new Map();
        resultsByTpe.flat().forEach(lead => {
            if (lead.business_status === 'OPERATIONAL' && lead.vicinity) {
                uniqueLeads.set(lead.place_id, lead);
            }
        });

        zipScoutResults.innerHTML = `<p>Found ${uniqueLeads.size} total businesses. Now checking each one...</p>`;

        const qualifiedLeads = [];
        const leadCheckPromises = [];

        for (const lead of uniqueLeads.values()) {
            // Check for corporate chain *first* (it's free, no API call)
            const lowerCaseName = lead.name.toLowerCase();
            let isCorporate = false;
            for (const chain of CORPORATE_CHAIN_BLOCKLIST) {
                if (lowerCaseName.includes(chain)) { isCorporate = true; break; }
            }
            if (isCorporate) { continue; }

            // If not corporate, *then* check for BD BTMs (API call)
            const checkPromise = checkNearbyBTMs(lead.geometry.location.lat, lead.geometry.location.lng)
                .then(({ bdCount }) => {
                    if (bdCount === 0) {
                        qualifiedLeads.push(lead); // Push the full lead object
                    }
                });
            leadCheckPromises.push(checkPromise);
        }
        
        await Promise.all(leadCheckPromises);
        displayZipLeads(qualifiedLeads);

    } catch (error) {
        console.error("ZIP Scout Error:", error);
        zipScoutResults.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
}

/**
 * Displays the final list of qualified leads for the ZIP Scout.
 */
function displayZipLeads(leads) {
    // NEW: Store leads for export
    lastZipLeads = leads.map(lead => ({
        name: lead.name,
        address: lead.vicinity,
        place_id: lead.place_id,
        lat: lead.geometry.location.lat,
        lng: lead.geometry.location.lng
    }));

    if (lastZipLeads.length === 0) {
        zipScoutResults.innerHTML = '<p>No qualified independent leads found with 0 BD BTMs nearby.</p>';
        exportControls.classList.add('hidden');
        return;
    }

    let html = `<h4>Found ${lastZipLeads.length} Qualified Leads:</h4>`;
    html += lastZipLeads.map(lead => `
        <div class="lead-card">
            <strong>${lead.name}</strong>
            <p>${lead.address}</p>
        </div>
    `).join('');
    
    zipScoutResults.innerHTML = html;
    exportControls.classList.remove('hidden'); // Show export buttons
}

// --- NEW EXPORT FUNCTIONS ---

/**
 * Creates a "virtual" download link and clicks it.
 */
function downloadFile(filename, content, mimeType) {
    const a = document.createElement('a');
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    a.setAttribute('href', url);
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

/**
 * Exports the lastZipLeads as a JSON file.
 */
function exportAsJSON() {
    if (lastZipLeads.length === 0) {
        alert("No leads to export.");
        return;
    }
    const jsonString = JSON.stringify(lastZipLeads, null, 2);
    downloadFile(`zip_scout_leads_${zipScoutInput.value}.json`, jsonString, 'application/json');
}

/**
 * Helper to sanitize strings for CSV (handles commas and quotes).
 */
function sanitizeCSV(str) {
    if (!str) return '""';
    let result = str.replace(/"/g, '""'); // Escape double quotes
    if (result.includes(',')) {
        result = `"${result}"`; // Wrap in quotes if it contains a comma
    }
    return result;
}

/**
 * Exports the lastZipLeads as a CSV file.
 */
function exportAsCSV() {
    if (lastZipLeads.length === 0) {
        alert("No leads to export.");
        return;
    }
    
    // Create CSV content
    const headers = ['Name', 'Address', 'Latitude', 'Longitude', 'PlaceID'];
    let csvContent = headers.join(',') + '\n'; // Header row

    lastZipLeads.forEach(lead => {
        const row = [
            sanitizeCSV(lead.name),
            sanitizeCSV(lead.address),
            lead.lat,
            lead.lng,
            lead.place_id
        ].join(',');
        csvContent += row + '\n';
    });

    downloadFile(`zip_scout_leads_${zipScoutInput.value}.csv`, csvContent, 'text/csv;charset=utf-8;');
}