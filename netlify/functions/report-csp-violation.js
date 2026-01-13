/**
 * Netlify Function for CSP Violation Reports
 * Handles Content Security Policy violation reports from browsers
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

    // Parse the CSP report
    const cspReport = JSON.parse(event.body);
    
    // Log the CSP violation for monitoring
    console.log('CSP Violation Report:', {
      violatedDirective: cspReport['csp-report']['violated-directive'],
      blockedURI: cspReport['csp-report']['blocked-uri'],
      documentURI: cspReport['csp-report']['document-uri'],
      referrer: cspReport['csp-report']['referrer'],
      effectiveDirective: cspReport['csp-report']['effective-directive'],
      originalPolicy: cspReport['csp-report']['original-policy'],
      disposition: cspReport['csp-report']['disposition'],
      date: new Date().toISOString(),
      userAgent: event.headers['user-agent'],
      ip: event.headers['x-forwarded-for'] || event.headers['x-nitro-proxy'] || 'unknown'
    });

    // In a production environment, you would:
    // 1. Store this in a database for analysis
    // 2. Send alerts to security team for suspicious violations
    // 3. Analyze patterns for potential attacks
    
    return {
      statusCode: 204, // No Content - successful report
      body: '',
      headers: {
        'Content-Type': 'text/plain'
      }
    };
    
  } catch (error) {
    console.error('Error processing CSP violation report:', error);
    
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid report format' }),
      headers: {
        'Content-Type': 'application/json'
      }
    };
  }
};
