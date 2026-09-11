const { withAppBuildGradle, withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo config plugin to optimize Android release builds:
 * 1. Sets android:largeHeap="true" for audio stream buffer & high-res artwork memory headroom.
 * 2. Discards unused language strings from AndroidX/libraries by keeping only "en" (saves ~2-4MB).
 * 3. Strips unreferenced vector-icons font files, preserving only Ionicons.ttf (saves ~4.1MB).
 * 4. Discards JavaScript source map files (.map) from release assets.
 */
const withFilteredFonts = (config) => {
  // Configure android:largeHeap="true" in AndroidManifest
  config = withAndroidManifest(config, (modConfig) => {
    const app = modConfig.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:largeHeap'] = 'true';
    }
    return modConfig;
  });

  return withAppBuildGradle(config, (config) => {
    const buildGradle = config.modResults.contents;
    const optimizationSnippet = `
// APK Size Optimization: Discard unused localization strings (saves ~2-4MB)
android.defaultConfig {
    resConfigs "en"
}

// APK Size Optimization: Strip unused vector icons and source maps from release assets
android.applicationVariants.all { variant ->
    variant.mergeAssetsProvider.configure {
        doLast {
            delete(fileTree(dir: outputDir, includes: [
                '**/AntDesign.ttf',
                '**/Entypo.ttf',
                '**/EvilIcons.ttf',
                '**/Feather.ttf',
                '**/FontAwesome.ttf',
                '**/FontAwesome5_*.ttf',
                '**/FontAwesome6_*.ttf',
                '**/Fontisto.ttf',
                '**/Foundation.ttf',
                '**/MaterialCommunityIcons.ttf',
                '**/MaterialIcons.ttf',
                '**/Octicons.ttf',
                '**/SimpleLineIcons.ttf',
                '**/Zocial.ttf',
                '**/*.map'
            ]))
        }
    }
}
`;
    if (!buildGradle.includes('// APK Size Optimization')) {
      config.modResults.contents = buildGradle + '\n' + optimizationSnippet;
    }
    return config;
  });
};

module.exports = withFilteredFonts;
