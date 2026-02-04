module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: { node: 'current' },
        modules: 'auto' // Convert ESM to CJS when running in Jest
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
