import React, { useState, useRef, useEffect } from "react";
import Uppy from "@uppy/core";
import Tus from "@uppy/tus";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

// Circular progress component
const CircularProgress = ({ percentage }) => {
    const radius = 15;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
        <svg className="w-10 h-10" viewBox="0 0 36 36">
            <circle
                cx="18"
                cy="18"
                r={radius}
                fill="transparent"
                stroke="#e6e6e6"
                strokeWidth="3"
            />
            <circle
                cx="18"
                cy="18"
                r={radius}
                fill="transparent"
                stroke="#3b82f6"
                strokeWidth="3"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90 18 18)"
            />
            <text
                x="18"
                y="18"
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#ffffff"
                fontSize="8"
                fontWeight="bold"
            >
                {percentage}%
            </text>
        </svg>
    );
};

// Success icon
const SuccessIcon = () => (
    <div className="rounded-full bg-green-500 p-1 w-6 h-6 flex items-center justify-center">
        <svg
            className="w-4 h-4 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                d="M5 13l4 4L19 7"
            />
        </svg>
    </div>
);

// Error icon
const FailIcon = () => (
    <div className="rounded-full bg-red-500 p-1 w-6 h-6 flex items-center justify-center">
        <svg
            className="w-4 h-4 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                d="M6 18L18 6M6 6l12 12"
            />
        </svg>
    </div>
);

// Retry button
const RetryButton = ({ onClick }) => (
    <div
        onClick={onClick}
        className="absolute bottom-2 right-2 rounded-full bg-blue-500 p-1 w-8 h-8 flex items-center justify-center cursor-pointer hover:bg-blue-600 transition-colors z-20"
    >
        <svg
            className="w-5 h-5 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
        </svg>
    </div>
);

const ImageUploader = () =>     {
    // States to manage uploaded images and files in progress
    const [images, setImages] = useState([]); // Successfully uploaded files
    const [pendingFiles, setPendingFiles] = useState([]); // Files in upload process
    const [isUploading, setIsUploading] = useState(false);

    // References for file input and Uppy instance
    const fileInputRef = useRef(null);
    const uppyRef = useRef(null);

    useEffect(() => {
        // Initialize Uppy and configure Tus plugin
        if (!uppyRef.current) {
            uppyRef.current = new Uppy({
                id: "uppy",
                autoProceed: true,
                restrictions: {
                    allowedFileTypes: ["image/*", ".tif", ".tiff"],
                },
            })
                .use(Tus, {
                    endpoint: "https://tusd.tusdemo.net/dd/", // Replace with your endpoint
                    retryDelays: [0, 1000, 3000, 5000],
                })
                .on("file-added", (file) => {
                    // Create a pendingFile and add it to the list
                    const pendingFile = {
                        id: file.id,
                        name: file.name,
                        url: URL.createObjectURL(file.data),
                        isPending: true,
                        index: pendingFiles.length + images.length,
                    };

                    setPendingFiles((prev) => [...prev, pendingFile]);
                    setIsUploading(true);
                })
                .on("upload-progress", (file, progress) => {
                    // Update pending files with progress
                    setPendingFiles((prev) =>
                        prev.map((pendingFile) =>
                            pendingFile.id === file.id
                                ? {
                                    ...pendingFile,
                                    progress: Math.floor((progress.bytesUploaded / progress.bytesTotal) * 100)
                                }
                                : pendingFile
                        )
                    );
                })
                .on("upload-success", (file, response) => {
                    // Move file from pendingFiles to images
                    const storageUrl = response.uploadURL || URL.createObjectURL(file.data);

                    const successfulFile = pendingFiles.find(pf => pf.id === file.id);
                    if (successfulFile) {
                        setImages((prev) => [
                            ...prev,
                            {
                                id: file.id,
                                name: file.name,
                                url: storageUrl,
                                uploadSuccess: true,
                                index: successfulFile.index,
                            },
                        ]);

                        setPendingFiles((prev) => prev.filter((pf) => pf.id !== file.id));
                    }

                    checkRemainingUploads();
                })
                .on("upload-error", (file, error) => {
                    console.error("Upload error:", error);

                    // Mark file as failed
                    setPendingFiles((prev) =>
                        prev.map((pf) =>
                            pf.id === file.id
                                ? { ...pf, uploadFailed: true }
                                : pf
                        )
                    );

                    checkRemainingUploads();
                })
                .on("complete", (result) => {
                    if (result.failed.length === 0 && result.successful.length > 0) {
                        setIsUploading(false);
                    }
                });
        }

        // Cleanup when unmounting
        return () => {
            if (uppyRef.current) {
                uppyRef.current = null;
            }
        };
    }, [pendingFiles.length, images.length]);

    // Check if there are still pending uploads
    const checkRemainingUploads = () => {
        if (uppyRef.current) {
            const state = uppyRef.current.getState();
            const activeUploads = state.currentUploads;
            const files = state.files;
            const hasPendingFiles = Object.keys(files).some(fileId =>
                files[fileId].progress.uploadStarted && !files[fileId].progress.uploadComplete);

            if (Object.keys(activeUploads).length === 0 && !hasPendingFiles) {
                setIsUploading(false);
            }
        }
    };

    // Open file selection dialog
    const handleUploadClick = () => {
        fileInputRef.current.click();
    };

    // Handle file selection
    const handleFileChange = (event) => {
        const files = event.target.files;
        if (files.length > 0) {
            setIsUploading(true);

            // Add each file to Uppy
            Array.from(files).forEach((file) => {
                try {
                    uppyRef.current.addFile({
                        name: file.name,
                        type: file.type || "image/*",
                        data: file
                    });
                } catch (error) {
                    console.error("Error adding file to Uppy:", error);
                }
            });
        }
        event.target.value = "";
    };

    // Handle retry for a failed file using Uppy's native retry
    const handleRetry = (fileId) => {
        if (uppyRef.current) {
            // Use Uppy's native retry functionality
            uppyRef.current.retryUpload(fileId);

            // Update the UI to show retrying state
            setPendingFiles((prev) =>
                prev.map((pf) =>
                    pf.id === fileId
                        ? { ...pf, uploadFailed: false, progress: 0 }
                        : pf
                )
            );

            setIsUploading(true);
        }
    };

    // Retry all failed files
    const handleRetryAll = () => {
        if (uppyRef.current) {
            // Get all failed files from Uppy's state
            const state = uppyRef.current.getState();
            const failedFiles = Object.values(state.files).filter(file => file.error);

            // Update UI for all failed files
            failedFiles.forEach(file => {
                setPendingFiles((prev) =>
                    prev.map((pf) =>
                        pf.id === file.id
                            ? { ...pf, uploadFailed: false, progress: 0 }
                            : pf
                    )
                );
            });

            // Use Uppy's native retryAll functionality
            uppyRef.current.retryAll();
            setIsUploading(true);
        }
    };

    // Reorganization via drag & drop
    const handleDragEnd = (result) => {
        if (!result.destination) return;
        const allItems = [...images, ...pendingFiles];
        const items = Array.from(allItems);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);
        const updatedItems = items.map((item, index) => ({ ...item, index }));

        // Separate uploaded items from pending ones
        setImages(updatedItems.filter((item) => !item.isPending));
        setPendingFiles(updatedItems.filter((item) => item.isPending));
    };

    // Example action: send ordered images to create an experiment
    const handleCreateExperiment = () => {
        console.log("Ordered images:", images);
        // Add your API logic or navigation here
    };

    // Check if at least one pending file has failed
    const hasFailedFiles = pendingFiles.some((file) => file.uploadFailed);

    // Render image grid
    const renderImageGrid = () => {
        const allItems = [...images, ...pendingFiles];
        allItems.sort((a, b) => a.index - b.index);

        if (allItems.length === 0) {
            return (
                <div className="text-gray-600 text-center">
                    No images selected.
                </div>
            );
        }

        return (
            <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="images" direction="horizontal">
                    {(provided, snapshot) => (
                        <div
                            className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-4 mb-8 max-h-[500px] overflow-y-auto p-1 ${
                                snapshot.isDraggingOver ? "bg-blue-50" : ""
                            }`}
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                        >
                            {allItems.map((item, index) => {
                                const showProgress = item.isPending && !item.uploadFailed;
                                return (
                                    <Draggable
                                        key={item.id}
                                        draggableId={item.id}
                                        index={index}
                                        isDragDisabled={showProgress && item.progress < 100}
                                    >
                                        {(provided, snapshot) => (
                                            <div
                                                className={`relative rounded-lg overflow-hidden bg-gray-100 shadow flex flex-col ${
                                                    snapshot.isDragging ? "shadow-md" : "shadow-sm"
                                                }`}
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                {...provided.dragHandleProps}
                                            >
                                                <div className="absolute top-1 left-1 bg-black bg-opacity-60 text-white text-xs font-bold px-1.5 py-0.5 rounded z-10">
                                                    {String(index + 1).padStart(2, "0")}
                                                </div>
                                                <div className="w-full h-[100px] overflow-hidden relative">
                                                    <img
                                                        src={item.url}
                                                        alt={item.name}
                                                        className={`w-full h-full object-cover ${
                                                            item.uploadFailed ? "opacity-70" : ""
                                                        }`}
                                                    />
                                                    {showProgress && (
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                                                            <CircularProgress percentage={item.progress || 0} />
                                                        </div>
                                                    )}
                                                    {item.uploadSuccess && (
                                                        <div className="absolute bottom-2 right-2">
                                                            <SuccessIcon />
                                                        </div>
                                                    )}
                                                    {item.uploadFailed && (
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-30">
                                                            <div className="mb-2">
                                                                <FailIcon />
                                                            </div>
                                                            <p className="text-white text-xs text-center px-2">
                                                                Upload failed
                                                            </p>
                                                            <div onClick={() => handleRetry(item.id)}>
                                                                <RetryButton />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-600 p-1 whitespace-nowrap overflow-hidden text-ellipsis">
                                                    {item.name}
                                                </div>
                                            </div>
                                        )}
                                    </Draggable>
                                );
                            })}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        );
    };

    return (
        <div className="bg-white rounded-lg shadow-lg w-[90%] max-w-[900px] mx-auto p-5 relative">
            <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-medium text-gray-800">Upload images</h2>
                <button className="text-2xl text-gray-400 cursor-pointer">&times;</button>
            </div>
            <p className="text-gray-600 mb-5 text-sm">
                Please ensure that the order of images is correct.
            </p>
            {renderImageGrid()}
            <div className="flex justify-center gap-3 mb-5">
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                    multiple
                    accept="image/*,.tif,.tiff"
                />
                <button
                    onClick={handleUploadClick}
                    className="flex items-center justify-center bg-white border border-gray-300 rounded px-4 py-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-100 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    disabled={isUploading}
                >
                    {isUploading ? "Uploading..." : "Select more images"}
                </button>
                {hasFailedFiles && (
                    <button
                        onClick={handleRetryAll}
                        className="flex items-center justify-center bg-blue-500 border border-blue-600 rounded px-4 py-2 text-sm text-white cursor-pointer hover:bg-blue-600"
                    >
                        Retry All Failed
                    </button>
                )}
            </div>
            <button
                onClick={handleCreateExperiment}
                className="block w-full bg-blue-500 text-white rounded py-3 text-base font-medium cursor-pointer hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed"
                disabled={
                    (images.length === 0 && pendingFiles.length === 0) ||
                    isUploading ||
                    hasFailedFiles
                }
            >
                {isUploading
                    ? "Uploading..."
                    : hasFailedFiles
                        ? "Retry Failed Uploads to Continue"
                        : "Create Experiment"}
            </button>
        </div>
    );
};

export default ImageUploader;