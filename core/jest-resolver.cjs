// Custom Jest resolver to handle .js extensions in ESM imports from @noble packages
module.exports = (path, options) => {
  // Call the default resolver
  return options.defaultResolver(path, {
    ...options,
    // Allow .js extensions to resolve to the actual package files
    packageFilter: (pkg) => {
      // For @noble packages, ensure they can be resolved properly
      if (pkg.name && pkg.name.startsWith('@noble/')) {
        return {
          ...pkg,
          main: pkg.module || pkg.main,
        };
      }
      return pkg;
    },
  });
};
