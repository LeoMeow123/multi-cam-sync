/*
 * Multi-Camera Trigger System
 *
 * Arduino firmware for synchronized multi-camera triggering.
 * Supports up to 4 cameras with hardware trigger output.
 *
 * Features:
 * - Simultaneous trigger pulses to all cameras
 * - Configurable frame rate (1-165 fps)
 * - Physical start button and kill switch
 * - Serial command interface
 *
 * Pin Assignments:
 *   Pin 2-5: Camera trigger outputs (directly to camera Line1)
 *   Pin 6: Start button (INPUT_PULLUP, active LOW)
 *   Pin 7: Kill switch (INPUT_PULLUP, active LOW)
 *   Pin 13: Status LED
 */

// ============================================================================
// Configuration
// ============================================================================

#define MAX_CAMERAS 4
#define DEFAULT_FPS 120
#define TRIGGER_PULSE_US 100  // Trigger pulse width in microseconds
#define DEBOUNCE_MS 50        // Button debounce time

// Pin assignments
const int triggerPins[MAX_CAMERAS] = {2, 3, 4, 5};
const int startButtonPin = 6;
const int killSwitchPin = 7;
const int statusLedPin = 13;

// ============================================================================
// State
// ============================================================================

enum State {
  STATE_IDLE,
  STATE_ARMED,
  STATE_RECORDING,
  STATE_STOPPING
};

volatile State currentState = STATE_IDLE;
volatile bool killTriggered = false;

unsigned long frameCount = 0;
unsigned long frameIntervalUs = 1000000 / DEFAULT_FPS;
int activeCameras = MAX_CAMERAS;
int currentFps = DEFAULT_FPS;

// Timing
unsigned long lastTriggerUs = 0;
unsigned long lastButtonCheck = 0;

// ============================================================================
// Setup
// ============================================================================

void setup() {
  // Initialize serial
  Serial.begin(115200);
  while (!Serial && millis() < 3000); // Wait for serial (max 3s)

  // Configure trigger pins as outputs
  for (int i = 0; i < MAX_CAMERAS; i++) {
    pinMode(triggerPins[i], OUTPUT);
    digitalWrite(triggerPins[i], LOW);
  }

  // Configure button inputs with internal pullup
  pinMode(startButtonPin, INPUT_PULLUP);
  pinMode(killSwitchPin, INPUT_PULLUP);

  // Status LED
  pinMode(statusLedPin, OUTPUT);
  digitalWrite(statusLedPin, LOW);

  // Startup blink
  for (int i = 0; i < 3; i++) {
    digitalWrite(statusLedPin, HIGH);
    delay(100);
    digitalWrite(statusLedPin, LOW);
    delay(100);
  }

  Serial.println("READY");
}

// ============================================================================
// Trigger Functions
// ============================================================================

void triggerAllCameras() {
  // Set all active trigger pins HIGH simultaneously
  // Using direct port manipulation for maximum synchronization

  // For Arduino UNO, pins 2-5 are on PORTD (bits 2-5)
  // This triggers all cameras within ~62.5ns of each other
  PORTD |= B00111100;  // Set pins 2,3,4,5 HIGH

  delayMicroseconds(TRIGGER_PULSE_US);

  // Set all trigger pins LOW
  PORTD &= B11000011;  // Set pins 2,3,4,5 LOW

  frameCount++;
}

void triggerSingleCamera(int camIndex) {
  if (camIndex >= 0 && camIndex < MAX_CAMERAS) {
    digitalWrite(triggerPins[camIndex], HIGH);
    delayMicroseconds(TRIGGER_PULSE_US);
    digitalWrite(triggerPins[camIndex], LOW);
  }
}

// ============================================================================
// Button Handling
// ============================================================================

void checkButtons() {
  // Debounce
  if (millis() - lastButtonCheck < DEBOUNCE_MS) return;
  lastButtonCheck = millis();

  // Kill switch - highest priority, always active
  if (digitalRead(killSwitchPin) == LOW) {
    if (currentState == STATE_RECORDING) {
      currentState = STATE_STOPPING;
      killTriggered = true;
      Serial.println("KILLED");
    }
    return;
  }

  // Start button - only active when armed
  if (currentState == STATE_ARMED && digitalRead(startButtonPin) == LOW) {
    Serial.println("BUTTON:START");
    startRecording();
  }
}

// ============================================================================
// Recording Control
// ============================================================================

void startRecording() {
  frameCount = 0;
  lastTriggerUs = micros();
  currentState = STATE_RECORDING;
  digitalWrite(statusLedPin, HIGH);
  Serial.println("RECORDING");
}

void stopRecording() {
  currentState = STATE_IDLE;
  digitalWrite(statusLedPin, LOW);
  Serial.print("STOPPED:");
  Serial.println(frameCount);
}

// ============================================================================
// Serial Command Processing
// ============================================================================

void processCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "START") {
    if (currentState == STATE_IDLE || currentState == STATE_ARMED) {
      startRecording();
    } else {
      Serial.println("ERROR:Already recording");
    }
  }
  else if (cmd == "STOP") {
    if (currentState == STATE_RECORDING) {
      stopRecording();
    } else {
      Serial.println("ERROR:Not recording");
    }
  }
  else if (cmd == "ARM") {
    if (currentState == STATE_IDLE) {
      currentState = STATE_ARMED;
      // Blink LED to indicate armed
      digitalWrite(statusLedPin, HIGH);
      delay(100);
      digitalWrite(statusLedPin, LOW);
      Serial.println("ARMED");
    } else {
      Serial.println("ERROR:Cannot arm while recording");
    }
  }
  else if (cmd == "DISARM") {
    if (currentState == STATE_ARMED) {
      currentState = STATE_IDLE;
      Serial.println("DISARMED");
    }
  }
  else if (cmd == "TRIGGER") {
    // Manual single trigger (for testing/preview)
    triggerAllCameras();
    Serial.print("TRIGGERED:");
    Serial.println(frameCount);
  }
  else if (cmd.startsWith("FPS:")) {
    int fps = cmd.substring(4).toInt();
    if (fps >= 1 && fps <= 165) {
      currentFps = fps;
      frameIntervalUs = 1000000 / fps;
      Serial.print("FPS_SET:");
      Serial.println(fps);
    } else {
      Serial.println("ERROR:FPS must be 1-165");
    }
  }
  else if (cmd.startsWith("CAMERAS:")) {
    int num = cmd.substring(8).toInt();
    if (num >= 1 && num <= MAX_CAMERAS) {
      activeCameras = num;
      Serial.print("CAMERAS_SET:");
      Serial.println(num);
    } else {
      Serial.println("ERROR:Cameras must be 1-4");
    }
  }
  else if (cmd == "STATUS") {
    Serial.print("STATUS:");
    switch (currentState) {
      case STATE_IDLE: Serial.print("IDLE"); break;
      case STATE_ARMED: Serial.print("ARMED"); break;
      case STATE_RECORDING: Serial.print("RECORDING"); break;
      case STATE_STOPPING: Serial.print("STOPPING"); break;
    }
    Serial.print(":");
    Serial.print(frameCount);
    Serial.print(":");
    Serial.print(currentFps);
    Serial.print(":");
    Serial.println(activeCameras);
  }
  else if (cmd == "PING") {
    Serial.println("PONG");
  }
  else if (cmd == "VERSION") {
    Serial.println("VERSION:1.0.0");
  }
  else if (cmd == "HELP") {
    Serial.println("COMMANDS:START,STOP,ARM,DISARM,TRIGGER,FPS:n,CAMERAS:n,STATUS,PING,VERSION");
  }
  else if (cmd.length() > 0) {
    Serial.print("ERROR:Unknown command: ");
    Serial.println(cmd);
  }
}

// ============================================================================
// Main Loop
// ============================================================================

void loop() {
  // Check buttons (always, for kill switch)
  checkButtons();

  // Handle serial commands
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    processCommand(cmd);
  }

  // Handle recording state
  if (currentState == STATE_RECORDING) {
    unsigned long now = micros();

    // Handle micros() overflow
    unsigned long elapsed;
    if (now >= lastTriggerUs) {
      elapsed = now - lastTriggerUs;
    } else {
      // Overflow occurred
      elapsed = (0xFFFFFFFF - lastTriggerUs) + now + 1;
    }

    if (elapsed >= frameIntervalUs) {
      triggerAllCameras();
      lastTriggerUs = now;

      // Optional: report frame count periodically (every 100 frames)
      // Commenting out to reduce serial traffic during recording
      // if (frameCount % 100 == 0) {
      //   Serial.print("FRAME:");
      //   Serial.println(frameCount);
      // }
    }
  }

  // Handle stopping state
  if (currentState == STATE_STOPPING) {
    stopRecording();
    killTriggered = false;
  }

  // LED blink pattern when armed (slow blink)
  if (currentState == STATE_ARMED) {
    static unsigned long lastBlink = 0;
    static bool ledState = false;
    if (millis() - lastBlink > 500) {
      ledState = !ledState;
      digitalWrite(statusLedPin, ledState);
      lastBlink = millis();
    }
  }
}
