/**
 * Netlify Function for Certificate Pinning Violation Reports
 * Handles HPKP violation reports from browsers
 */

exports.handler = async (event, context) => {
  try {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' }),
        headers: {
          'Content-Type': 'application/json'
        }
      };
    }

    // Parse the report body
    const reportData = JSON.parse(event.body);
    
    // Log the pin violation for monitoring
    console.log('Certificate Pinning Violation Report:', {
      reportedHost: reportData['reported-host'],
      servedCertificateChain: reportData['served-certificate-chain'],
      validatedCertificateChain: reportData['validated-certificate-chain'],
      date: new Date().toISOString(),
      userAgent: event.headers['user-agent'],
      ip: event.headers['x-forwarded-for'] || event.headers['x-nitro-proxy'] || 'unknown'
    });

    // In a production environment, you would:
    // 1. Store this in a database for analysis
    // 2. Send alerts to security team
    // 3. Potentially block the violating request
    
    return {
      statusCode: 204, // No Content - successful report
      body: '',
      headers: {
        'Content-Type': 'text/plain'
      }
    };
    
  } catch (error) {
    console.error('Error processing pin violation report:', error);
    
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid report format' }),
      headers: {
        'Content-Type': 'application/json'
      }
    };
  }
};
