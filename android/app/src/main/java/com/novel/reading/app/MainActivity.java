package com.novel.reading.app;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.graphics.Insets;
import com.getcapacitor.BridgeActivity;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 1. Enable full edge-to-edge
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // 2. Make system bars transparent
        getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
        getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);
        
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }

        // 3. Fix content cramping: Apply padding ONLY to the content container
        // This ensures the background still extends under the bars, but UI is safe
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            return insets;
        });

        // 4. Dynamically control icon coloring
        updateSystemBarIcons();
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateSystemBarIcons();
    }

    private void updateSystemBarIcons() {
        boolean isDarkMode = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) 
            == Configuration.UI_MODE_NIGHT_YES;
            
        WindowInsetsControllerCompat controller = 
            new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        
        // Light icons in Dark Mode, Dark icons in Light Mode
        controller.setAppearanceLightStatusBars(!isDarkMode);
        controller.setAppearanceLightNavigationBars(!isDarkMode);
    }
}
