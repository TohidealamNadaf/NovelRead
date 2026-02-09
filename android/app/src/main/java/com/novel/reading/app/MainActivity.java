package com.novel.reading.app;

import android.os.Bundle;
import android.os.Build;
import android.graphics.Color;
import android.content.res.Configuration;
import android.view.View;
import androidx.core.view.WindowCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.graphics.Insets;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 1. Enable full edge-to-edge
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // 2. Make system bars transparent
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }

        // 3. Fix content cramping: Responsibility shifted to Web layer (CSS/React)
        // We no longer apply padding here so the background can bleed into the bars.
        // View contentView = findViewById(android.R.id.content);
        // ... removed padding logic ...

        // 4. Dynamically control icon coloring
        updateSystemBarIcons();
    }

    @Override
    public void onResume() {
        super.onResume();
        updateSystemBarIcons();
    }

    private void updateSystemBarIcons() {
        boolean isDarkMode = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) 
            == Configuration.UI_MODE_NIGHT_YES;
            
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        
        // Light icons in Dark Mode, Dark icons in Light Mode
        controller.setAppearanceLightStatusBars(!isDarkMode);
        controller.setAppearanceLightNavigationBars(!isDarkMode);
    }
}
