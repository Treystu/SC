module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: { node: 'current' },
        modules: false
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
