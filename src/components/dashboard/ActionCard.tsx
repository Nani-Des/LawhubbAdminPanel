import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../ui/Card';
import { ArrowRight } from 'lucide-react';

interface ActionCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  className?: string;
}

const ActionCard: React.FC<ActionCardProps> = ({
  title,
  description,
  icon,
  path,
  className = '',
}) => {
  const navigate = useNavigate();

  return (
    <div
      className={`
        cursor-pointer transition-all duration-300 group
        hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98]
        ${className}
      `}
      onClick={() => navigate(path)}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          navigate(path);
        }
      }}
    >
      <Card className="bg-white border-gray-200 hover:bg-gray-50 transition-colors">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="flex-shrink-0 p-3 rounded-xl bg-gradient-to-r from-gray-800 to-gray-900 text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                {icon}
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-800 transition-colors duration-200">
                  {title}
                </h3>
                <p className="mt-1 text-sm text-gray-700 leading-relaxed">
                  {description}
                </p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-700 group-hover:text-gray-900 transition-colors" />
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ActionCard;