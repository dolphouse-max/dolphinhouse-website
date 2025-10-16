// Admin Authentication API
export const POST = async ({ request, cookies }) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const data = await request.json();
    const { username, password } = data;
    
    // Simple authentication - in a real app, you would check against a database
    // and use proper password hashing
    if (username === 'admin' && password === 'dolphin2023') {
      // Set a session cookie
      cookies.set('admin_session', 'authenticated', {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        maxAge: 60 * 60 * 24 // 24 hours
      });
      
      return new Response(
        JSON.stringify({ success: true, message: 'Login successful' }),
        { headers }
      );
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid username or password' }),
        { status: 401, headers }
      );
    }
  } catch (error) {
    console.error('Auth error:', error);
    
    return new Response(
      JSON.stringify({ error: 'Authentication failed', details: error.message }),
      { status: 500, headers }
    );
  }
};

export const DELETE = async ({ cookies }) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  cookies.delete('admin_session', { path: '/' });
  
  return new Response(
    JSON.stringify({ success: true, message: 'Logged out successfully' }),
    { headers }
  );
};

export const OPTIONS = async () => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  return new Response(null, { headers });
};