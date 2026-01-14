module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: { node: 'current' },
        modules: false // Keep ESM for Jest experimental-vm-modules
      }
    ],
    [
      '@babel/preset-typescript',
      {
        allowNamespaces: true,
        onlyRemoveTypeImports: true
      }
    ]
  ],
  plugins: [
    [
      '@babel/plugin-transform-runtime',
      {
        useESModules: true
      }
    ]
  ]
};
