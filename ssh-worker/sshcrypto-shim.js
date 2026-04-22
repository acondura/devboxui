// A "Ghost" shim that exports nothing. 
// This forces libraries like ssh2 to use their internal Pure JS fallbacks.
module.exports = {};
