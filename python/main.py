#!/usr/bin/env python3
"""
Camera Sync System - Python Backend

Entry point for camera control subprocess.

Usage:
  python main.py --ipc              # IPC mode (for Electron)
  python main.py --detect           # Detect cameras and exit
  python main.py --test <ip>        # Test capture from camera
"""

import argparse
import sys


def main():
    parser = argparse.ArgumentParser(description="Camera Sync System Backend")
    parser.add_argument(
        "--ipc",
        action="store_true",
        help="Run in IPC mode (for Electron communication)",
    )
    parser.add_argument(
        "--detect",
        action="store_true",
        help="Detect cameras and print results",
    )
    parser.add_argument(
        "--test",
        metavar="IP",
        help="Test capture from camera at specified IP",
    )
    parser.add_argument(
        "--camera-id",
        default="cam1",
        help="Camera ID for IPC mode (default: cam1)",
    )

    args = parser.parse_args()

    if args.ipc:
        # Run IPC handler for Electron communication
        from ipc_handler import run_ipc_loop

        run_ipc_loop()

    elif args.detect:
        # Detect and print cameras
        from camera_manager import CameraManager

        print("Detecting cameras...")
        cameras = CameraManager.detect_cameras()

        if not cameras:
            print("No cameras found")
        else:
            print(f"Found {len(cameras)} camera(s):")
            for cam in cameras:
                print(f"  - {cam.friendly_name}")
                print(f"    IP: {cam.ip_address}")
                print(f"    Serial: {cam.serial_number}")
                print(f"    Model: {cam.model_name}")
                print()

    elif args.test:
        # Test capture from camera
        from camera_manager import CameraManager
        from camera_types import CameraSettings

        ip = args.test
        print(f"Testing camera at {ip}...")

        settings = CameraSettings(camera_ip=ip)
        manager = CameraManager("test", settings)

        if manager.connect(ip):
            print("Connected!")

            # Grab test frame
            print("Grabbing test frame...")
            frame = manager.grab_frame()

            if frame is not None:
                print(f"Frame captured: {frame.shape}")

                # Save test frame
                from PIL import Image

                img = Image.fromarray(frame)
                img.save("test_frame.png")
                print("Saved to test_frame.png")
            else:
                print("Failed to capture frame")

            manager.disconnect()
        else:
            print("Failed to connect")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
