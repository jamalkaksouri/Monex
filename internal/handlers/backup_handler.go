package handlers

import (
	"archive/zip"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"Monex/internal/database"

	"github.com/labstack/echo/v4"
)

// BackupHandler creates a database backup
func BackupHandler(db *database.DB) echo.HandlerFunc {
	return func(c echo.Context) error {
		// Create temporary directory for backup
		tempDir := filepath.Join(os.TempDir(), fmt.Sprintf("monex_backup_%d", time.Now().Unix()))
		if err := os.MkdirAll(tempDir, 0755); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "خطا در تولید مسیر موقت")
		}
		defer os.RemoveAll(tempDir)

		// Get database file path (assuming SQLite)
		dbPath := "./data.db"

		// Check if database file exists
		if _, err := os.Stat(dbPath); os.IsNotExist(err) {
			return echo.NewHTTPError(http.StatusNotFound, "فایل دیتابیس پیدا نشد")
		}

		// Create backup filename with timestamp
		timestamp := time.Now().Format("2006-01-02_15-04-05")
		backupFilename := fmt.Sprintf("backup_%s.zip", timestamp)
		backupPath := filepath.Join(tempDir, backupFilename)

		// Create zip file
		zipFile, err := os.Create(backupPath)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "خطا در ایجاد بکاپ دیتابیس")
		}
		defer zipFile.Close()

		zipWriter := zip.NewWriter(zipFile)
		defer zipWriter.Close()

		// Add database file to zip
		if err := addFileToZip(zipWriter, dbPath, "data.db"); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "خطا در اضافه کردن دیتابیس به بکاپ")
		}

		// Add WAL and SHM files if they exist
		walPath := dbPath + "-wal"
		if _, err := os.Stat(walPath); err == nil {
			addFileToZip(zipWriter, walPath, "data.db-wal")
		}

		shmPath := dbPath + "-shm"
		if _, err := os.Stat(shmPath); err == nil {
			addFileToZip(zipWriter, shmPath, "data.db-shm")
		}

		// Close zip writer before sending
		if err := zipWriter.Close(); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "پشتیبان گیری نهایی نشد")
		}

		// Send file as download
		return c.Attachment(backupPath, backupFilename)
	}
}

// addFileToZip adds a file to the zip archive
func addFileToZip(zipWriter *zip.Writer, filePath, zipPath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return err
	}

	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}

	header.Name = zipPath
	header.Method = zip.Deflate

	writer, err := zipWriter.CreateHeader(header)
	if err != nil {
		return err
	}

	_, err = io.Copy(writer, file)
	return err
}

