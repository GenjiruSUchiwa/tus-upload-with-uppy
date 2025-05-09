import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import { XCircle, RotateCcw } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

const FileUploader = ({
                        onUploadSuccess,
                        maxFileSize = 100 * 1024 * 1024,
                        allowedFileTypes = ['image/*'],
                      }) => {
  const [uppy, setUppy] = useState(null);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const uppyInstance = new Uppy({
      restrictions: { maxFileSize, allowedFileTypes },
      autoProceed: true,
    }).use(Tus, {
      endpoint: 'http://localhost:5284/api/v1/experiments/68dd40ef-5572-4c8b-8267-28eca17ccec0/images',
      headers: {
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3ZTQ0NGRmMi1mYWM1LTRhYTEtYmZiZC03YWNmYjIzMjVjOGMiLCJpYXQiOjE3NDQyMjE3MDIzOTksImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL25hbWVpZGVudGlmaWVyIjoiN2U0NDRkZjItZmFjNS00YWExLWJmYmQtN2FjZmIyMzI1YzhjIiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvZW1haWxhZGRyZXNzIjoibWJhc3NpLmFyaXN0aWRlMEBnbWFpbC5jb20iLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJDbGllbnQiLCJleHAiOjE3NDY4MTM3MDIsImlzcyI6Imh0dHBzOi8vbG9jYWxob3N0OjcyMzYiLCJhdWQiOiJodHRwczovL2xvY2FsaG9zdDo3MjM2In0.9S93touyUGerv0M6LzYAt1SpxzL4g9yt95f9LDAWJUE"
      },
      retryDelays: [0, 1000, 3000, 5000],
    });

    uppyInstance.on('file-added', (file) => {

      setFiles((prevFiles) => [
        ...prevFiles,
        {
          id: file.id,
          name: file.name,
          preview: URL.createObjectURL(file.data),
          progress: 0,
          status: 'uploading',
          error: null,
          },
      ]);
    });

    uppyInstance.on('upload-progress', (file, progress) => {
      const { bytesUploaded, bytesTotal } = progress;
      const progressPercentage = (bytesUploaded / bytesTotal) * 100;
      setFiles((prevFiles) =>
          prevFiles.map((prevFile) =>
              prevFile.id === file.id
                  ? { ...prevFile, progress: progressPercentage }
                  : prevFile
          )
      );
    });

    uppyInstance.on('upload-success', (file, response) => {
      setFiles((prevFiles) =>
          prevFiles.map((prevFile) =>
              prevFile.id === file.id
                  ? { ...prevFile, status: 'success', progress: 100 }
                  : prevFile
          )
      );
      if (onUploadSuccess) onUploadSuccess(file, response);
    });

    uppyInstance.on('upload-error', (file, error) => {
      setFiles((prevFiles) =>
          prevFiles.map((prevFile) =>
              prevFile.id === file.id
                  ? { ...prevFile, status: 'error', error: error.message }
                  : prevFile
          )
      );
      setError(`Erreur lors de l'upload de ${file.name}: ${error.message}`);
    });

    setUppy(uppyInstance);

    return () => {
      uppyInstance.close();
      files.forEach((file) => {
        if (file.preview) URL.revokeObjectURL(file.preview);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDragEnd = useCallback(
      (result) => {
        if (!result.destination) return;
        const reorderedFiles = Array.from(files);
        const [removed] = reorderedFiles.splice(result.source.index, 1);
        reorderedFiles.splice(result.destination.index, 0, removed);
        setFiles(reorderedFiles);
      },
      [files]
  );

  const retryUpload = (fileId) => {
    if (uppy) {
      const fileToRetry = uppy.getFile(fileId);
      if (fileToRetry) {
        setFiles((prevFiles) =>
            prevFiles.map((prevFile) =>
                prevFile.id === fileId
                    ? { ...prevFile, status: 'uploading', progress: 0, error: null }
                    : prevFile
            )
        );
        uppy.retryUpload(fileId);
        setError(null);
      }
    }
  };

  const removeFile = (fileId) => {
    if (uppy) {
      uppy.removeFile(fileId);
      setFiles((prevFiles) =>
          prevFiles.filter((file) => file.id !== fileId)
      );
    }
  };

  const handleSelectFiles = (event) => {
    const selectedFiles = event.target.files;
    for (const file of selectedFiles) {
      uppy.addFile({
        name: file.name,
        type: file.type,
        data: file,
        meta: {
          contentType: file.type,
          name: file.name,
          experimentId: '68dd40ef-5572-4c8b-8267-28eca17ccec0',
          time: '120',
          index: '1'

        },
      });
    }
    event.target.value = '';
  };

  const getCircleProps = (progressPercentage) => {
    const radius = 20;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset =
        circumference - (progressPercentage / 100) * circumference;
    return { radius, circumference, strokeDashoffset };
  };

  return (
      <div className="w-full">
        <div className="App">
          <h1 className="text-2xl mb-4 font-bold text-center">
            Système d'upload et réorganisation d'images
          </h1>
          <div className="bg-white rounded-lg shadow-lg w-[90%] max-w-[900px] mx-auto p-5 relative">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-medium text-gray-800">
                Upload images
              </h2>
              <button className="text-2xl text-gray-400 cursor-pointer">
                ×
              </button>
            </div>
            <p className="text-gray-600 mb-5 text-sm">
              Please ensure that the order of images is correct.
            </p>
            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
                  {error}
                </div>
            )}

            <div className="mb-4 flex justify-center">
              <input
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  accept="image/*,.tif,.tiff"
                  type="file"
                  onChange={handleSelectFiles}
              />
              <button
                  onClick={() => fileInputRef.current.click()}
                  className="flex items-center justify-center bg-white border border-gray-300 rounded px-4 py-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-100"
              >
                Select more images
              </button>
            </div>

            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="images" direction="horizontal">
                {(provided) => (
                    <div
                        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-4 mb-8 max-h-[500px] overflow-y-auto p-1"
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                    >
                      {files.map((file, index) => {
                        const { radius, circumference, strokeDashoffset } =
                            getCircleProps(file.progress);
                        return (
                            <Draggable
                                key={file.id}
                                draggableId={file.id}
                                index={index}
                            >
                              {(provided) => (
                                  <div
                                      className="relative rounded-lg overflow-hidden bg-gray-100 shadow flex flex-col group"
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                  >
                                    <div className="absolute top-1 left-1 bg-black bg-opacity-60 text-white text-xs font-bold px-1.5 py-0.5 rounded z-10">
                                      {String(index + 1).padStart(2, '0')}
                                    </div>
                                    <div className="w-full h-[100px] overflow-hidden relative">
                                      {file.preview && (
                                          <img
                                              src={file.preview}
                                              alt={file.name}
                                              className="w-full h-full object-cover opacity-70"
                                          />
                                      )}
                                      {file.status !== 'success' && (
                                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-30">
                                            {file.status === 'uploading' && (
                                                <svg
                                                    className="w-12 h-12"
                                                    viewBox={`0 0 ${
                                                        radius * 2 + 10
                                                    } ${radius * 2 + 10}`}
                                                >
                                                  <circle
                                                      cx={radius + 5}
                                                      cy={radius + 5}
                                                      r={radius}
                                                      fill="none"
                                                      stroke="#e2e8f0"
                                                      strokeWidth="4"
                                                  />
                                                  <circle
                                                      cx={radius + 5}
                                                      cy={radius + 5}
                                                      r={radius}
                                                      fill="none"
                                                      stroke="#3b82f6"
                                                      strokeWidth="4"
                                                      strokeDasharray={circumference}
                                                      strokeDashoffset={strokeDashoffset}
                                                      transform={`rotate(-90 ${radius + 5} ${
                                                          radius + 5
                                                      })`}
                                                      strokeLinecap="round"
                                                  />
                                                  <text
                                                      x="50%"
                                                      y="50%"
                                                      textAnchor="middle"
                                                      dy=".3em"
                                                      fill="white"
                                                      fontSize="12"
                                                  >
                                                    {Math.round(file.progress)}%
                                                  </text>
                                                </svg>
                                            )}
                                            {file.status === 'error' && (
                                                <div className="flex flex-col items-center justify-center">
                                                  <XCircle className="w-10 h-10 text-red-500" />
                                                  <button
                                                      onClick={() =>
                                                          retryUpload(file.id)
                                                      }
                                                      className="mt-2 flex items-center bg-blue-500 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-600"
                                                  >
                                                    <RotateCcw className="w-4 h-4 mr-1" />
                                                    Réessayer
                                                  </button>
                                                </div>
                                            )}
                                          </div>
                                      )}
                                    </div>
                                    <div className="p-2 bg-white">
                                      <p
                                          className="text-xs text-gray-600 truncate"
                                          title={file.name}
                                      >
                                        {file.name}
                                      </p>
                                      {/* Champ pour la métadonnée custom */}
                                      <div className="mt-2">
                                        <label className="block text-xs text-gray-500">
                                          Meta custom:
                                        </label>
                                        <input
                                            type="text"
                                            value={file.meta?.custom || ''}
                                            onChange={(e) => {
                                              const newMeta = e.target.value;
                                              // Mise à jour du state local
                                              setFiles((prevFiles) =>
                                                  prevFiles.map((f) =>
                                                      f.id === file.id
                                                          ? {
                                                            ...f,
                                                            meta: {
                                                              ...f.meta,
                                                              custom: newMeta,
                                                            },
                                                          }
                                                          : f
                                                  )
                                              );
                                              // Mise à jour dans Uppy pour qu'il envoie ces métadonnées
                                              uppy.setFileMeta(file.id, {
                                                custom: newMeta,
                                              });
                                            }}
                                            className="w-full border border-gray-300 rounded p-1 text-xs"
                                            placeholder="Entrez une valeur"
                                        />
                                      </div>
                                      <div className="flex justify-between items-center mt-1">
                                <span
                                    className={`text-xs ${
                                        file.status === 'success'
                                            ? 'text-green-600'
                                            : file.status === 'error'
                                                ? 'text-red-600'
                                                : 'text-blue-600'
                                    }`}
                                >
                                  {file.status === 'success'
                                      ? 'Terminé'
                                      : file.status === 'error'
                                          ? 'Erreur'
                                          : 'En cours'}
                                </span>
                                        <button
                                            onClick={() => removeFile(file.id)}
                                            className="text-gray-500 hover:text-red-500"
                                        >
                                          <XCircle className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                              )}
                            </Draggable>
                        );
                      })}
                      {/** Affichage de l'espace vide pour le droppable */}
                      {provided.placeholder}
                    </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        </div>
      </div>
  );
};

export default FileUploader;
