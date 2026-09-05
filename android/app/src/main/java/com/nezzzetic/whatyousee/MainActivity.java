package com.nezzzetic.whatyousee;

import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * P-02: небо занимает экран целиком — статус-бара нет.
 *
 * Почему не «покрасить в чёрный»: MIUI в чёрной полосе не рисует значки тёмными,
 * а прячет часы и связь совсем (свой индикатор батареи оставляет). Флаг светлых
 * значков она игнорирует и из темы приложения, и из темы запуска, и из
 * WindowInsetsControllerCompat — окно остаётся LIGHT_STATUS_BARS. То есть выбор
 * был между чёрной полосой с пустотой на месте часов и отсутствием полосы вовсе.
 *
 * Навигационную панель НЕ трогаем: по ней игрок выходит из игры, а её нижний край
 * и так занят свёрнутой шторкой (--peek-h).
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        goImmersive();
    }

    /**
     * Свайп от верхнего края показывает статус-бар поверх игры и прячет его сам.
     * После возврата фокуса (свернули и вернулись, закрыли системный диалог)
     * режим приходится ставить заново — иначе полоса остаётся висеть.
     */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) goImmersive();
    }

    private void goImmersive() {
        // Окно рисуется под системными полосами — без этого место статус-бара
        // осталось бы пустым отступом, а не небом.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WindowInsetsControllerCompat insets =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insets.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        insets.hide(WindowInsetsCompat.Type.statusBars());
    }
}
