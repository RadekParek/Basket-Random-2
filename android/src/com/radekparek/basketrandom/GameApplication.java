package com.radekparek.basketrandom;

import android.app.Application;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;

public final class GameApplication extends Application {
    @Override public void onCreate() {
        super.onCreate();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override public void uncaughtException(Thread thread, Throwable error) {
                try {
                    StringWriter trace = new StringWriter();
                    error.printStackTrace(new PrintWriter(trace));
                    FileOutputStream output = openFileOutput("last-crash.txt", MODE_PRIVATE);
                    output.write(trace.toString().getBytes("UTF-8"));
                    output.close();
                } catch (Exception ignored) {
                }
                if (previous != null) previous.uncaughtException(thread, error);
                else System.exit(10);
            }
        });
    }
}
