import React, { useState, useRef, useCallback } from "react";
import Uppy from "@uppy/core";
import Tus from "@uppy/tus";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

const ImageUploader = () => {
    const [images, setImages] = useState([]);
    const [pendingFiles, setPendingFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    const uppyRef = useRef(null);

    // Initialisation d'Uppy
    React.useEffect(() => {
        uppyRef.current = new Uppy({
            id: "uppy",
            autoProceed: false, // Désactiver l'upload automatique
            allowMultipleUploadBatches: true,
            restrictions: {
                maxFileSize: 5000000, // 5MB
                allowedFileTypes: ["image/*"],
            },
        })
            .use(Tus, {
                endpoint: "https://tusd.tusdemo.net/files/", // Remplacer par votre endpoint tus
                retryDelays: [0, 1000, 3000, 5000],
            })
            .on("upload-success", (file, response) => {
                const imageUrl = response.uploadURL || URL.createObjectURL(file.data);

                setImages((prevImages) => [
                    ...prevImages,
                    {
                        id: file.id,
                        name: file.name,
                        url: imageUrl,
                        index: prevImages.length,
                    },
                ]);
            })
            .on("upload-error", (file, error) => {
                console.error("Upload error:", error);
                setIsUploading(false);
            })
            .on("complete", () => {
                setIsUploading(false);
                setPendingFiles([]);
            });

        return () => {
            if (uppyRef.current) {
                uppyRef.current.destroy();
            }
        };
    }, []);

    const handleUploadClick = () => {
        fileInputRef.current.click();
    };

    const handleFileChange = (event) => {
        const files = event.target.files;
        if (files.length > 0) {
            // Créer des aperçus locaux pour les fichiers sélectionnés
            const newPendingFiles = Array.from(files).map(file => ({
                id: `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: file.name,
                url: URL.createObjectURL(file),
                file: file,
                isPending: true,
            }));

            setPendingFiles(prevPendingFiles => [...prevPendingFiles, ...newPendingFiles]);
        }
    };

    const handleDragEnd = useCallback((result) => {
        if (!result.destination) return;

        // Combiner les images téléchargées et en attente pour le réordonnancement
        const allItems = [...images, ...pendingFiles];
        const items = Array.from(allItems);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        // Mettre à jour les indices après réorganisation et séparer à nouveau les listes
        const updatedItems = items.map((item, index) => ({
            ...item,
            index,
        }));

        // Séparer les images téléchargées et en attente
        const updatedImages = updatedItems.filter(item => !item.isPending);
        const updatedPendingFiles = updatedItems.filter(item => item.isPending);

        setImages(updatedImages);
        setPendingFiles(updatedPendingFiles);
    }, [images, pendingFiles]);

    const handleCreateExperiment = () => {
        // Uploader tous les fichiers en attente
        if (pendingFiles.length > 0) {
            setIsUploading(true);

            // Ajouter tous les fichiers en attente à Uppy
            pendingFiles.forEach(pendingFile => {
                uppyRef.current.addFile({
                    name: pendingFile.name,
                    type: pendingFile.file.type,
                    data: pendingFile.file,
                });
            });

            // Démarrer l'upload
            uppyRef.current.upload();
        } else {
            // Logique pour créer l'expérience avec les images déjà ordonnées
            console.log("Images ordonnées:", images);
            // Appel API ou autre logique ici
        }
    };

    // Fonction pour rendre la grille d'images
    const renderImageGrid = () => {
        // Combiner les images déjà téléchargées et celles en attente
        const allImages = [...images, ...pendingFiles];

        // Si aucune image, ne pas rendre le système de drag and drop
        if (allImages.length === 0) {
            return (
                <div className="empty-state">
                    <p>No images selected yet. Select some images to begin.</p>
                </div>
            );
        }

        return (
            <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable
                    droppableId="images"
                    direction="horizontal"
                    isDropDisabled={false}
                    isCombineEnabled={false}
                    ignoreContainerClipping={false}
                    type="DEFAULT"
                >
                    {(provided, snapshot) => (
                        <div
                            className={`images-grid ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                        >
                            {allImages.map((image, index) => (
                                <Draggable
                                    key={String(image.id)}
                                    draggableId={String(image.id)}
                                    index={index}
                                    isDragDisabled={isUploading}
                                    disableInteractiveElementBlocking={true}
                                >
                                    {(provided, snapshot) => (
                                        <div
                                            className={`image-item ${snapshot.isDragging ? 'dragging' : ''}`}
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            {...provided.dragHandleProps}
                                            style={{
                                                ...provided.draggableProps.style
                                            }}
                                        >
                                            <div className="image-number">{String(index + 1).padStart(2, '0')}</div>
                                            <div className="image-container">
                                                <img src={image.url} alt={image.name} />
                                                {image.isPending && (
                                                    <div className="pending-overlay">Pending</div>
                                                )}
                                            </div>
                                            <div className="image-name">{image.name}</div>
                                        </div>
                                    )}
                                </Draggable>
                            ))}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        );
    };

    return (
        <div className="image-uploader-modal">
            <div className="image-uploader-header">
                <h2>Upload images</h2>
                <button className="close-button">×</button>
            </div>

            <p className="instruction-text">
                Please make sure your images are correctly ordered according to your experiment setup
            </p>

            {/* Rendu de la grille d'images */}
            {renderImageGrid()}

            <div className="upload-actions">
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    onChange={handleFileChange}
                    multiple
                    accept="image/*"
                />
                <button
                    className="upload-more-button"
                    onClick={handleUploadClick}
                    disabled={isUploading}
                >
                    {isUploading ? "Uploading..." : "Select more images"}
                </button>
            </div>

            <button
                className="create-experiment-button"
                onClick={handleCreateExperiment}
                disabled={(images.length === 0 && pendingFiles.length === 0) || isUploading}
            >
                {isUploading ? "Uploading..." : `Create Experiment${pendingFiles.length > 0 ? " & Upload Images" : ""}`}
            </button>
        </div>
    );
};

export default ImageUploader;