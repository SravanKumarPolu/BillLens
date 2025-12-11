package com.billlens

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.provider.Telephony
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Native module for reading SMS messages on Android
 * 
 * Note: This requires SMS permissions and should only be used
 * when the user has explicitly granted permission.
 */
class SMSReaderModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "SMSReader"
    }

    /**
     * Read recent SMS messages
     * @param limit Maximum number of SMS to read
     * @param maxAge Maximum age in milliseconds (only read SMS newer than this)
     */
    @ReactMethod
    fun readSMS(limit: Int, maxAge: Long, promise: Promise) {
        try {
            val context = reactApplicationContext
            
            // Check permissions
            if (!hasSMSPermission()) {
                promise.reject("PERMISSION_DENIED", "SMS permission not granted")
                return
            }

            val messages = mutableListOf<WritableMap>()
            val uri = Uri.parse("content://sms/inbox")
            val cursor: Cursor? = context.contentResolver.query(
                uri,
                arrayOf("_id", "address", "body", "date", "read"),
                null,
                null,
                "date DESC LIMIT $limit"
            )

            cursor?.use {
                val idIndex = it.getColumnIndex("_id")
                val addressIndex = it.getColumnIndex("address")
                val bodyIndex = it.getColumnIndex("body")
                val dateIndex = it.getColumnIndex("date")
                val readIndex = it.getColumnIndex("read")

                val currentTime = System.currentTimeMillis()

                while (it.moveToNext() && messages.size < limit) {
                    val smsDate = it.getLong(dateIndex)
                    val age = currentTime - smsDate

                    // Only include SMS within maxAge
                    if (age <= maxAge) {
                        val message = Arguments.createMap()
                        message.putString("id", it.getString(idIndex))
                        message.putString("address", it.getString(addressIndex))
                        message.putString("body", it.getString(bodyIndex))
                        message.putDouble("date", smsDate.toDouble())
                        message.putBoolean("read", it.getInt(readIndex) == 1)
                        messages.add(message)
                    }
                }
            }

            val result = Arguments.createArray()
            messages.forEach { result.pushMap(it) }
            promise.resolve(result)

        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to read SMS: ${e.message}", e)
        }
    }

    /**
     * Check if SMS permissions are granted
     */
    @ReactMethod
    fun hasSMSPermission(promise: Promise) {
        promise.resolve(hasSMSPermission())
    }

    private fun hasSMSPermission(): Boolean {
        val context = reactApplicationContext
        return context.checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED &&
               context.checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * Get SMS count (for debugging)
     */
    @ReactMethod
    fun getSMSCount(promise: Promise) {
        try {
            val context = reactApplicationContext
            
            if (!hasSMSPermission()) {
                promise.reject("PERMISSION_DENIED", "SMS permission not granted")
                return
            }

            val uri = Uri.parse("content://sms/inbox")
            val cursor: Cursor? = context.contentResolver.query(uri, arrayOf("_id"), null, null, null)
            val count = cursor?.count ?: 0
            cursor?.close()
            
            promise.resolve(count)
        } catch (e: Exception) {
            promise.reject("ERROR", "Failed to get SMS count: ${e.message}", e)
        }
    }
}
