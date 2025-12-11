package com.billlens

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.telephony.SmsMessage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Broadcast Receiver for incoming SMS messages
 * Automatically processes SMS when auto-fetch is enabled
 */
class SMSReceiver : BroadcastReceiver() {
    
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != "android.provider.Telephony.SMS_RECEIVED") {
            return
        }

        val bundle: Bundle? = intent.extras
        if (bundle == null) {
            return
        }

        val pdus = bundle.get("pdus") as? Array<*> ?: return
        val messages = arrayOfNulls<SmsMessage>(pdus.size)

        for (i in pdus.indices) {
            val format = bundle.getString("format")
            messages[i] = if (format != null) {
                SmsMessage.createFromPdu(pdus[i] as ByteArray, format)
            } else {
                SmsMessage.createFromPdu(pdus[i] as ByteArray)
            }
        }

        // Process each SMS message
        for (smsMessage in messages) {
            smsMessage?.let { message ->
                val address = message.originatingAddress ?: ""
                val body = message.messageBody ?: ""
                val timestamp = message.timestampMillis

                // Send to React Native
                sendSMSToReactNative(context, address, body, timestamp)
            }
        }
    }

    private fun sendSMSToReactNative(
        context: Context,
        address: String,
        body: String,
        timestamp: Long
    ) {
        try {
            // Get React Native context from MainApplication
            val app = context.applicationContext as? MainApplication
            val reactInstanceManager = app?.reactNativeHostInstance?.reactInstanceManager
            val reactContext = reactInstanceManager?.currentReactContext as? ReactContext

            reactContext?.let { rnContext ->
                // Create event data
                val params = Arguments.createMap().apply {
                    putString("address", address)
                    putString("body", body)
                    putDouble("timestamp", timestamp.toDouble())
                    putString("id", "sms_${timestamp}_${address.hashCode()}")
                }

                // Send event to React Native
                rnContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("SMSReceived", params)
            } ?: run {
                // If React Native context is not available, we can't process now
                // The SMS will be picked up when user manually scans
                android.util.Log.d("SMSReceiver", "React Native context not available, SMS will be processed on next scan")
            }
        } catch (e: Exception) {
            android.util.Log.e("SMSReceiver", "Error sending SMS to React Native: ${e.message}", e)
        }
    }
}
